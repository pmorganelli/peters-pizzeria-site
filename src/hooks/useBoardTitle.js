import { useEffect } from 'react';
import { PAGE_TITLES } from '../utils/routes';

// Stable route title: the hook's cleanup must not capture whichever page title
// happened to be in the document when this lazy module first loaded.
const BASE_TITLE = PAGE_TITLES.admin;

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
