# Copernicus Data Space Ecosystem setup

One-time configuration needed to render Sentinel-2 imagery (either for the
shared default deployment, or for your own [personal CDSE ID](#personal-cdse-id-bring-your-own-id)).

## Configuration steps

1. Create a free account on [dataspace.copernicus.eu](https://dataspace.copernicus.eu/).
2. Go to the [Configuration Utility](https://shapps.dataspace.copernicus.eu/dashboard/#/configurations).
3. **New Configuration** (based on a Sentinel-2 L2A template), give it a name.
4. Create the 4 layers below (**New Layer** button), pasting the linked
   evalscript into each:

   | Layer ID | Evalscript |
   |---|---|
   | `TRUE-COLOR` | [`docs/evalscripts/true-color.js`](docs/evalscripts/true-color.js) |
   | `FALSE-COLOR` | [`docs/evalscripts/false-color.js`](docs/evalscripts/false-color.js) |
   | `TCO-L2A` (Highlight Optimized Natural Color) | [`docs/evalscripts/tco-l2a.js`](docs/evalscripts/tco-l2a.js) |
   | `WILDFIRE` (QuickFire v1.0.0 by [Pierre Markuse](https://twitter.com/Pierre_Markuse), CC BY 4.0) | [`docs/evalscripts/wildfire.js`](docs/evalscripts/wildfire.js) |

5. Get the **Instance ID** shown in the configuration's panel.
6. Paste it into [`src/lib/config.ts`](src/lib/config.ts) (`SH_INSTANCE_ID`),
   and check that `MODE_LAYERS` points to the right Layer IDs if you named
   them differently.

⚠️ **Note on Instance ID:** The Instance ID is embedded in the frontend
client-side code by design. To prevent third-party usage from impacting the
default shared instance limits, visitors can configure their own personal
CDSE credentials directly within the application using the 🔑 button (see
below).

## Personal CDSE ID (Bring Your Own ID)

All visitors of the app share the same Instance ID by default (and
therefore the same free Sentinel Hub quota). If that shared quota runs out
— the app detects it (HTTP 429) and shows an explicit message instead of
blank tiles — or if you just want to never depend on it, you can set your
own Instance ID:

1. Click the 🔑 button in the app's navbar (or let it open automatically
   when the shared quota is detected as exhausted).
2. Follow the instructions shown in the window: create a free CDSE
   account, create a configuration, create the **same 4 layers listed
   above** in it (`TRUE-COLOR`, `FALSE-COLOR`, `TCO-L2A`, `WILDFIRE`, with
   the same evalscripts) — without these layers under the same names, the
   tiles would stay blank.
3. Paste that configuration's Instance ID into the field. It's stored only
   in `localStorage`, on that device — never sent anywhere other than
   directly to Sentinel Hub, exactly like the default shared Instance ID.

The 🔑 button turns blue/active once a personal ID is set; a "Revert to
shared quota" button in the same window clears it.
