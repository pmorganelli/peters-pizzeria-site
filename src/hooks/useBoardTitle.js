import { useEffect } from 'react';

// Captured at module load, before the board ever renames the tab, so the
// cleanup always restores the site's real title rather than whatever the
// previous render happened to set.
const BASE_TITLE = document.title;

// Surfaces the board's queue in the tab title, so an admin who has the board
// open behind another tab still sees work arriving.
//
// Takedown requests get a flag glyph rather than a second count: a tab title
// truncates fast, and the glyph is the part that still reads at ~12 chars. It
// leads for the same reason — orders arrive constantly and a takedown request
// almost never does, so the rare thing is the one worth noticing.
export function useBoardTitle({ waiting, takedowns }) {
  useEffect(() => {
    const flag = takedowns > 0 ? '⚑ ' : '';
    if (waiting > 0) document.title = `${flag}(${waiting}) New order${waiting === 1 ? '' : 's'} — Peter's Pizzeria`;
    else if (takedowns > 0) document.title = `⚑ ${takedowns} takedown request${takedowns === 1 ? '' : 's'} — Peter's Pizzeria`;
    else document.title = BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [waiting, takedowns]);
}
