/* Commonwealth Radio -- where the page finds the transmitter.
   The only file you should need to edit after AzuraCast is up. */
var RADIO = {
  /* AzuraCast's address, no trailing slash. Leave "" when this page is served
     from the same host as AzuraCast (or by tools/mock_azuracast.py).
     Anything else needs the page's own origin added under AzuraCast >
     System Settings > "API Access-Control-Allow-Origin", or every call is
     blocked by the browser and the page shows OFF AIR. */
  base: "https://radio.tanukibroadcasting.com",

  /* The station's short name, set when the station is created. It is the
     middle of every public URL: /listen/<shortcode>/radio.mp3 */
  shortcode: "tanuki_broadcasting",

  /* Seconds between now-playing polls. AzuraCast rewrites its static
     now-playing file about every 15 s, so polling faster buys nothing. */
  poll: 15,

  /* Rows per page in the request list. */
  requestRows: 20
};
