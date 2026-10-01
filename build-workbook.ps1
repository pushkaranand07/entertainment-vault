param(
    [string]$WorkbookPath = (Join-Path $PSScriptRoot 'Anime_Watchlist_Image_Enriched_updated.xlsx'),
    [string]$OutputDirectory = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $WorkbookPath -PathType Leaf)) {
    throw "Workbook not found: $WorkbookPath"
}

function Read-ZipXml {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$EntryName
    )

    $entry = $Archive.GetEntry($EntryName)
    if (-not $entry) {
        throw "Required workbook entry not found: $EntryName"
    }

    $stream = $entry.Open()
    try {
        $reader = [System.IO.StreamReader]::new($stream)
        try {
            return [xml]$reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Get-WorksheetRows {
    param(
        [xml]$Document,
        [string[]]$SharedStrings
    )

    $rows = @()
    foreach ($rowNode in $Document.GetElementsByTagName('row')) {
        $cells = @{}
        foreach ($cell in $rowNode.ChildNodes) {
            if ($cell.LocalName -ne 'c') {
                continue
            }

            $reference = $cell.GetAttribute('r')
            $column = [regex]::Match($reference, '^[A-Z]+').Value
            $valueNode = $cell.SelectSingleNode('./*[local-name()="v"]')
            $value = ''
            if ($valueNode) {
                $value = $valueNode.InnerText
            }
            else {
                $inlineNode = $cell.SelectSingleNode('./*[local-name()="is"]')
                if ($inlineNode) {
                    $textParts = @($inlineNode.SelectNodes('.//*[local-name()="t"]') | ForEach-Object { $_.InnerText })
                    $value = $textParts -join ''
                }
            }

            if ($cell.GetAttribute('t') -eq 's' -and $value -ne '') {
                $value = $SharedStrings[[int]$value]
            }

            if ($column) {
                $cells[$column] = [string]$value
            }
        }

        $rows += [pscustomobject]@{
            Number = [int]$rowNode.GetAttribute('r')
            Cells = $cells
        }
    }

    return $rows
}

function Get-CellValue {
    param(
        [object]$Row,
        [string]$Column
    )

    if ($Row.Cells.ContainsKey($Column)) {
        return [string]$Row.Cells[$Column]
    }
    return ''
}

function Get-ImageExtension {
    param([string]$ContentType)

    switch -Regex ($ContentType) {
        'image/jpeg' { return '.jpg' }
        'image/png' { return '.png' }
        'image/gif' { return '.gif' }
        'image/bmp' { return '.bmp' }
        default { throw "Unsupported embedded image type: $ContentType" }
    }
}

function Save-Poster {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$EntryName,
        [string]$Destination
    )

    $entry = $Archive.GetEntry($EntryName)
    if (-not $entry) {
        throw "Poster image not found in workbook: $EntryName"
    }

    $input = $entry.Open()
    $image = $null
    $bitmap = $null
    $graphics = $null
    $output = $null
    $parameters = $null
    try {
        $image = [System.Drawing.Image]::FromStream($input)
        $maxWidth = 420
        $maxHeight = 620
        $scale = [Math]::Min(($maxWidth / $image.Width), ($maxHeight / $image.Height))
        $width = [Math]::Max(1, [int][Math]::Round($image.Width * $scale))
        $height = [Math]::Max(1, [int][Math]::Round($image.Height * $scale))
        $bitmap = [System.Drawing.Bitmap]::new($width, $height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($image, 0, 0, $width, $height)

        $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
            Where-Object { $_.MimeType -eq 'image/jpeg' } |
            Select-Object -First 1
        if (-not $jpegCodec) {
            throw 'JPEG image encoder is unavailable.'
        }

        $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
        $parameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
            [System.Drawing.Imaging.Encoder]::Quality,
            [long]84
        )
        $output = [System.IO.File]::Create($Destination)
        $bitmap.Save($output, $jpegCodec, $parameters)
    }
    finally {
        if ($output) { $output.Dispose() }
        if ($parameters) { $parameters.Dispose() }
        if ($graphics) { $graphics.Dispose() }
        if ($bitmap) { $bitmap.Dispose() }
        if ($image) { $image.Dispose() }
        $input.Dispose()
    }
}

$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $WorkbookPath).Path)
try {
    $sharedStringDocument = Read-ZipXml -Archive $archive -EntryName 'xl/sharedStrings.xml'
    $sharedStrings = @()
    foreach ($item in $sharedStringDocument.GetElementsByTagName('si')) {
        $parts = @($item.GetElementsByTagName('t') | ForEach-Object { $_.InnerText })
        $sharedStrings += ,($parts -join '')
    }

    $watchlistRows = Get-WorksheetRows -Document (Read-ZipXml -Archive $archive -EntryName 'xl/worksheets/sheet1.xml') -SharedStrings $sharedStrings
    $summaryRows = Get-WorksheetRows -Document (Read-ZipXml -Archive $archive -EntryName 'xl/worksheets/sheet2.xml') -SharedStrings $sharedStrings
    $researchRows = Get-WorksheetRows -Document (Read-ZipXml -Archive $archive -EntryName 'xl/worksheets/sheet3.xml') -SharedStrings $sharedStrings

    $summaryByTitle = @{}
    foreach ($row in $summaryRows) {
        $title = Get-CellValue -Row $row -Column 'A'
        if ($title) {
            $summaryByTitle[$title.Trim().ToLowerInvariant()] = $row
        }
    }

    $researchByTitle = @{}
    foreach ($row in $researchRows) {
        $title = Get-CellValue -Row $row -Column 'A'
        if ($title) {
            $researchByTitle[$title.Trim().ToLowerInvariant()] = $row
        }
    }

    $drawingRelationships = Read-ZipXml -Archive $archive -EntryName 'xl/drawings/_rels/drawing1.xml.rels'
    $imageByRow = @{}
    foreach ($relationship in $drawingRelationships.DocumentElement.ChildNodes) {
        $imageByRow[$relationship.GetAttribute('Id')] = $relationship.GetAttribute('Target').Replace('../', '')
    }

    $drawing = Read-ZipXml -Archive $archive -EntryName 'xl/drawings/drawing1.xml'
    foreach ($anchor in $drawing.DocumentElement.ChildNodes) {
        $from = $anchor.SelectSingleNode('./*[local-name()="from"]')
        $rowNode = $from.SelectSingleNode('./*[local-name()="row"]')
        $blip = $anchor.SelectSingleNode('.//*[local-name()="blip"]')
        if (-not $rowNode -or -not $blip) {
            continue
        }

        $imageRelationship = $blip.GetAttribute('embed', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        if ($imageByRow.ContainsKey($imageRelationship)) {
            $imageByRow[[int]$rowNode.InnerText + 1] = $imageByRow[$imageRelationship]
        }
    }

    $posterDirectory = Join-Path $OutputDirectory 'assets\posters'
    [System.IO.Directory]::CreateDirectory($posterDirectory) | Out-Null
    $records = @()
    foreach ($row in $watchlistRows) {
        $title = (Get-CellValue -Row $row -Column 'B').Trim()
        if ($row.Number -lt 5 -or -not $title) {
            continue
        }

        $posterPath = ''
        if ($imageByRow.ContainsKey($row.Number)) {
            $posterName = 'anime-{0:D3}.jpg' -f $row.Number
            Save-Poster -Archive $archive -EntryName ('xl/' + $imageByRow[$row.Number]) -Destination (Join-Path $posterDirectory $posterName)
            $posterPath = 'assets/posters/' + $posterName
        }

        $key = $title.ToLowerInvariant()
        $summary = $summaryByTitle[$key]
        $research = $researchByTitle[$key]
        $genreText = (Get-CellValue -Row $row -Column 'F').Trim()
        $records += [pscustomobject][ordered]@{
            title = $title
            type = (Get-CellValue -Row $row -Column 'C').Trim()
            seasons = (Get-CellValue -Row $row -Column 'D').Trim()
            episodes = (Get-CellValue -Row $row -Column 'E').Trim()
            genres = @($genreText -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
            rating = (Get-CellValue -Row $row -Column 'G').Trim()
            synopsis = (Get-CellValue -Row $row -Column 'H').Trim()
            status = (Get-CellValue -Row $row -Column 'I').Trim()
            notes = (Get-CellValue -Row $row -Column 'J').Trim()
            country = if ($summary) { (Get-CellValue -Row $summary -Column 'D').Trim() } else { '' }
            currentImdb = if ($summary) { (Get-CellValue -Row $summary -Column 'E').Trim() } else { '' }
            verifiedInformation = if ($research) { (Get-CellValue -Row $research -Column 'B').Trim() } else { '' }
            researchSource = if ($research) { (Get-CellValue -Row $research -Column 'C').Trim() } else { '' }
            poster = $posterPath
        }
    }

    $outputPath = Join-Path $OutputDirectory 'data.js'
    $json = ConvertTo-Json -InputObject @($records) -Depth 6 -Compress
    [System.IO.File]::WriteAllText($outputPath, "window.ANIME_DATA = $json;", [System.Text.UTF8Encoding]::new($false))
    Write-Output ("Built {0} titles and {1} posters into {2}" -f $records.Count, @($records | Where-Object { $_.poster }).Count, $OutputDirectory)
}
finally {
    $archive.Dispose()
}
