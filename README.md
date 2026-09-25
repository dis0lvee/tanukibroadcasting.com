# Tanuki Broadcasting

The website of **Commonwealth Radio**, a Tanuki Broadcasting station out of
Midoriheiki, for the Commonwealth on CivMC.

**Listen: <https://tanukibroadcasting.com>**

Plain HTML, one stylesheet, one script; no build step. Everything that
changes (the song, the listeners, the schedule, the request line) is read
live from the station's AzuraCast at `radio.tanukibroadcasting.com`, which
`config.js` names. The page is served by GitHub Pages; the station is not.

| file | what it is |
| --- | --- |
| `index.html` | the station site |
| `player.html` | the pop-up player |
| `radio.css` / `radio.js` | the look and the logic |
| `config.js` | where the station is: the one file to edit |
| `tanuki.png`, `favicon.png` | the mascot |
| `CNAME` | tells Pages to answer as tanukibroadcasting.com |
