(() => {
  'use strict';

  const titles = Array.isArray(window.ANIME_DATA) ? window.ANIME_DATA : [];
  const byId = (id) => document.getElementById(id);
  const statusFilter = byId('status-filter');
  const genreFilter = byId('genre-filter');
  const sortFilter = byId('sort-filter');
  const searchInput = byId('search-input');
  let activePage = 'overview';

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const numberFromText = (text) => {
    const match = String(text || '').match(/\d+/);
    return match ? Number(match[0]) : 0;
  };

  const ratingOf = (item) => Number.parseFloat(String(item.rating).replace(/[^\d.]/g, '')) || 0;

  const posterFor = (item) => item.poster || '';

  const showDetail = (item) => {
    const dialog = byId('detail-dialog');
    const poster = byId('detail-poster');
    poster.src = posterFor(item);
    poster.alt = `${item.title} poster`;
    byId('detail-title').textContent = item.title;
    byId('detail-rating').textContent = ratingOf(item).toFixed(1);
    byId('detail-synopsis').textContent = item.synopsis || 'No synopsis was included in the workbook.';

    const meta = byId('detail-meta');
    meta.replaceChildren();
    [item.type, item.status].filter(Boolean).forEach((label) => meta.append(make('span', 'detail-pill', label)));

    const facts = byId('detail-facts');
    facts.replaceChildren();
    [
      ['Seasons / parts', item.seasons],
      ['Total', item.episodes],
      ['Country / origin', item.country],
      ['Current IMDb', item.currentImdb]
    ].filter((fact) => fact[1]).forEach(([label, value]) => {
      const fact = make('div', 'detail-fact');
      fact.append(make('span', '', label), make('strong', '', value));
      facts.append(fact);
    });

    const genres = byId('detail-genres');
    genres.replaceChildren();
    item.genres.forEach((genre) => genres.append(make('span', 'genre-tag', genre)));

    const notesSection = byId('detail-notes-section');
    notesSection.classList.toggle('is-hidden', !item.notes);
    byId('detail-notes').textContent = item.notes || '';

    const researchSection = byId('detail-research-section');
    researchSection.classList.toggle('is-hidden', !item.verifiedInformation);
    byId('detail-research').textContent = item.verifiedInformation || '';
    byId('detail-source').textContent = item.researchSource ? `Source: ${item.researchSource}` : '';
    dialog.showModal();
  };

  const makeAnimeCard = (item, compact = false) => {
    const card = make('button', compact ? 'anime-card anime-card-compact' : 'anime-card');
    card.type = 'button';
    card.setAttribute('aria-label', `View details for ${item.title}`);

    const imageWrap = make('span', 'poster-wrap');
    const image = make('img', 'poster-image');
    image.src = posterFor(item);
    image.alt = `${item.title} poster`;
    image.loading = 'lazy';
    image.decoding = 'async';
    imageWrap.append(image);
    const status = make('span', `status-pill ${item.status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, item.status || 'Unspecified');
    imageWrap.append(status);

    const copy = make('span', 'card-copy');
    const line = make('span', 'card-meta-line');
    line.append(make('span', 'card-type', item.type || 'Anime'));
    const score = make('span', 'card-score');
    score.append(make('span', 'score-star', '★'), document.createTextNode(` ${ratingOf(item).toFixed(1)}`));
    line.append(score);
    copy.append(line);
    copy.append(make('span', 'card-title', item.title));
    copy.append(make('span', 'card-episodes', [item.seasons, item.episodes].filter(Boolean).join(' · ')));

    const genreList = make('span', 'card-genres');
    item.genres.slice(0, compact ? 2 : 3).forEach((genre) => genreList.append(make('span', 'genre-tag', genre)));
    copy.append(genreList);
    card.append(imageWrap, copy);
    card.addEventListener('click', () => showDetail(item));
    return card;
  };

  const renderStats = () => {
    const completed = titles.filter((item) => item.status.toLowerCase() === 'completed').length;
    const rated = titles.filter((item) => ratingOf(item) > 0);
    const average = rated.length ? rated.reduce((sum, item) => sum + ratingOf(item), 0) / rated.length : 0;
    const episodes = titles.reduce((sum, item) => sum + numberFromText(item.episodes), 0);
    byId('stat-total').textContent = titles.length.toLocaleString();
    byId('stat-completed').textContent = completed.toLocaleString();
    byId('stat-rating').textContent = average.toFixed(1);
    byId('stat-episodes').textContent = episodes.toLocaleString();
    byId('sidebar-total').textContent = titles.length.toLocaleString();
  };

  const renderBreakdowns = () => {
    const counts = new Map();
    titles.forEach((item) => counts.set(item.status || 'Unspecified', (counts.get(item.status || 'Unspecified') || 0) + 1));
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const breakdown = byId('status-breakdown');
    breakdown.replaceChildren();
    ordered.forEach(([status, count], index) => {
      const row = make('div', 'breakdown-row');
      const label = make('div', 'breakdown-label');
      label.append(make('span', `breakdown-dot breakdown-dot-${index % 4}`), make('span', '', status), make('strong', '', `${count}`));
      const track = make('div', 'breakdown-track');
      const bar = make('span', `breakdown-bar breakdown-bar-${index % 4}`);
      bar.style.width = `${(count / titles.length) * 100}%`;
      track.append(bar);
      row.append(label, track);
      breakdown.append(row);
    });

    const genres = new Map();
    titles.forEach((item) => item.genres.forEach((genre) => genres.set(genre, (genres.get(genre) || 0) + 1)));
    const mostCommon = [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const genreBreakdown = byId('genre-breakdown');
    genreBreakdown.replaceChildren();
    mostCommon.forEach(([genre, count], index) => {
      const row = make('div', 'genre-row');
      row.append(make('span', `genre-rank rank-${index + 1}`, `0${index + 1}`), make('span', 'genre-name', genre));
      const amount = make('span', 'genre-count', `${count} titles`);
      row.append(amount);
      genreBreakdown.append(row);
    });
  };

  const renderFeatured = () => {
    const grid = byId('featured-grid');
    grid.replaceChildren();
    [...titles].sort((a, b) => ratingOf(b) - ratingOf(a) || a.title.localeCompare(b.title)).slice(0, 4)
      .forEach((item) => grid.append(makeAnimeCard(item, true)));
  };

  const fillFilters = () => {
    [...new Set(titles.map((item) => item.status).filter(Boolean))].sort().forEach((status) => {
      statusFilter.append(make('option', '', status));
      statusFilter.lastElementChild.value = status;
    });
    [...new Set(titles.flatMap((item) => item.genres))].sort().forEach((genre) => {
      genreFilter.append(make('option', '', genre));
      genreFilter.lastElementChild.value = genre;
    });
  };

  const filteredTitles = () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const status = statusFilter.value;
    const genre = genreFilter.value;
    const results = titles.filter((item) => {
      const haystack = [item.title, item.synopsis, item.notes, item.genres.join(' '), item.status].join(' ').toLocaleLowerCase();
      return (!query || haystack.includes(query))
        && (status === 'all' || item.status === status)
        && (genre === 'all' || item.genres.includes(genre));
    });
    if (sortFilter.value === 'title') results.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortFilter.value === 'episodes') results.sort((a, b) => numberFromText(b.episodes) - numberFromText(a.episodes));
    else results.sort((a, b) => ratingOf(b) - ratingOf(a) || a.title.localeCompare(b.title));
    return results;
  };

  const renderLibrary = () => {
    const results = filteredTitles();
    const grid = byId('anime-grid');
    grid.replaceChildren();
    results.forEach((item) => grid.append(makeAnimeCard(item)));
    byId('results-count').textContent = `${results.length} ${results.length === 1 ? 'title' : 'titles'}`;
    byId('empty-state').classList.toggle('is-hidden', results.length !== 0);
  };

  const renderResearch = () => {
    const notes = titles.filter((item) => item.verifiedInformation);
    byId('research-count').textContent = `${notes.length} verified notes`;
    const list = byId('research-list');
    list.replaceChildren();
    notes.sort((a, b) => a.title.localeCompare(b.title)).forEach((item) => {
      const card = make('article', 'research-card');
      const heading = make('div', 'research-card-heading');
      heading.append(make('h3', '', item.title), make('span', 'research-score', `★ ${ratingOf(item).toFixed(1)}`));
      card.append(heading, make('p', 'research-copy', item.verifiedInformation));
      const source = make('span', 'research-source', item.researchSource ? `SOURCE  /  ${item.researchSource}` : 'SOURCE  /  NOT LISTED');
      card.append(source);
      list.append(card);
    });
  };

  const setPage = (page) => {
    activePage = page;
    const pages = {
      overview: ['overview-view', 'Overview', 'A story for every mood.', 'Your watchlist, artwork, ratings and research — thoughtfully brought together.'],
      library: ['library-view', 'My watchlist', 'Every story, at your fingertips.', 'Search, filter and find exactly what you feel like watching.'],
      research: ['research-view', 'Research notes', 'The details behind the stories.', 'A little context makes every watch even better.']
    };
    const [visibleId, breadcrumb, title, subtitle] = pages[page] || pages.overview;
    Object.values(pages).forEach(([id]) => byId(id).classList.toggle('is-hidden', id !== visibleId));
    document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('is-active', button.dataset.page === page));
    byId('breadcrumb-current').textContent = breadcrumb;
    byId('page-title').textContent = title;
    byId('page-subtitle').textContent = subtitle;
    byId('heading-note').classList.toggle('is-hidden', page !== 'overview');
    if (page === 'library') renderLibrary();
  };

  if (!titles.length) {
    document.querySelector('.page-content').replaceChildren(
      make('section', 'load-error', 'The workbook data is missing. Run build-workbook.ps1 to generate data.js and the poster images.')
    );
    return;
  }

  renderStats();
  renderBreakdowns();
  renderFeatured();
  fillFilters();
  renderLibrary();
  renderResearch();

  document.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      setPage(button.dataset.page);
    });
  });

  [searchInput, statusFilter, genreFilter, sortFilter].forEach((control) => {
    control.addEventListener('input', renderLibrary);
    control.addEventListener('change', renderLibrary);
  });
  byId('clear-filters').addEventListener('click', () => {
    searchInput.value = '';
    statusFilter.value = 'all';
    genreFilter.value = 'all';
    sortFilter.value = 'rating';
    renderLibrary();
  });

  byId('dialog-close').addEventListener('click', () => byId('detail-dialog').close());
  byId('detail-dialog').addEventListener('click', (event) => {
    if (event.target === byId('detail-dialog')) byId('detail-dialog').close();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setPage('library');
      searchInput.focus();
    }
  });
})();
