// Abre la sección cuando se llega por un link (por ejemplo /guia/#entregas) o se toca el índice.
  function abrir() { var d = location.hash && document.getElementById(location.hash.slice(1)); if (d && d.tagName === 'DETAILS') { d.open = true; d.scrollIntoView(); } }
  window.addEventListener('hashchange', abrir); abrir();
