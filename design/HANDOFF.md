# Integration Atlas home and reading collections

Reference revision `822e098d289b79ef8f7f82b91aadb61b0d33aaa3`. The home reference is `docs/index.html`. The collection reference is the native dialog created by `docs/workspace.js`. Use the existing generated static site, local artwork and reader preference controls. Apply home structure changes in the generator so a rebuild retains them.

## Home

Place the site navigation above a two-column introduction. Keep a single page heading, the directory link in the first reading sequence. Use the existing illustration beside the introduction. On narrow screens put the text and actions above the image. Between the introduction and stories, show three named links to the Stock, Material and Package directory filters. Calculate counts from the catalog at build time. The whole card is one link. Preserve story order, titles and destinations in the story section. Links must remain usable with scripts disabled. Give decorative images empty alternative text when adjacent text already conveys their purpose.

## Directory collections

Use the existing collection selector and name/domain search. Each home card opens the matching collection through the collection query parameter and directory fragment. Reflect the filter in the selector, result count and visible list. Include the all-collections, filtered, combined-search and zero-result states in built review. Use five task cards below the collection links. The hero artwork is the bundled docs/assets/atlas-home.webp.

## Reading collections

Open the workspace from a named button. Its heading and close action should remain easy to reach. Keep the integration lookup, saved pages and reading history separately labelled. Stack groups at narrow widths. Each populated collection starts with its item count and collection-wide actions. In each row place the linked page title above its path and group item actions after the link. Wrap long titles, paths and action labels. Use a single vertical scroll area within the dialog at small heights.

| State | Expected behavior |
| --- | --- |
| Home, initial | Directory and story links resolve from the deployed site base. The reading workspace opens without leaving home. |
| Lookup | Expose pending, matching, empty and error feedback. Open the selected guide, overview or reference using a real link. |
| No saved pages or history | Explain the relevant first action in each empty section. Show the save form on eligible pages. |
| Populated collections | Keep saved names and existing history order. Resume the previous eligible page. Preserve per-item and whole-collection JSON exports. |
| Remove or clear | Name the item in its action's accessible label. After removal focus the nearest remaining link or section input. Focus Cancel when confirming a bulk clear and restore the trigger on cancellation. |
| Storage unavailable | Announce that changes last for this page. Keep the workspace usable. |
| Close | Support Escape and the close button. Return focus to the opener. |

## Acceptance references

Use 1440 × 900 as the normal viewport and 320 × 640 as the minimum design reference. Inspect the home and every dialog state with keyboard navigation, visible focus, long saved names and a nested article URL. Exercise light and dark appearance, English, Cantonese and bilingual control settings, and 100%, 125%, 150% and 200% display scaling. Keep article titles in their source language. Choose foreground and background colors from the site's theme and preserve reduced-motion settings. Capture built results separately from these design references.
