COURIER: SAP FILES - ONE NEW FILE, AND SOME MUST COME DAILY

The server already receives these files from you (last arrival on the server):
  IW39 YTD.XLSX    2026-11-26     IW49 YTD.XLSX   2026-11-24
  IK17 YTD.XLSX    2026-11-22     Backlog.XLSX    2026-11-27
  ME5A ytd.XLSX    2026-11-24     ME2L ytd.XLSX   2026-11-24
  mb52.XLSX        2026-11-24     mb51 ytd.XLSX   2026-11-15
Keep sending all of them exactly as today (same folder sap_import, same
names, same columns). Only the changes below.

1. NEW FILE: ME5K (purchase requisitions by account assignment)
   The server needs to know WHICH WORK ORDER each requested part is for.
   - Transaction ME5K, account assignment category F (order), plant as today.
   - Columns (keep SAP's own header text, do not rename):
       Purchase Requisition, Item of Requisition, Order, Material,
       Short Text, Quantity Requested, Unit of Measure, Requisition Date,
       Delivery Date, Purchase Order, Purchase Order Item,
       Processing status, Deletion Indicator, Release Indicator
   - Open AND closed requisitions of the last 12 months.
   - Upload as: sap_import / ME5K.XLSX, sheet_name ME5K. Daily.

2. MAKE THESE DAILY (on the server some are 3 to 12 days old)
   mb51, ME2L, ME5A, mb52, IW49, IK17 - every working day, like IW39.
   mb51 matters most: it is how the server sees a part ARRIVE (movement
   101) or be GIVEN TO A JOB (261).
   If a file did not change, upload it anyway - an old date on the server
   looks the same as "the courier stopped".

3. IW39: 12 MONTHS, NOT THIS YEAR ONLY
   Export a rolling 12 months (today minus 365 days to today). Same
   columns, same file name. Otherwise on 1 January every machine looks
   like it was never serviced.

4. STOP SENDING PRIVATE HR FILES
   Salaries, staff ratings and biometric attendance files are not used by
   the server. Do not upload them any more.

RULES
- Keep SAP's own column headers. Never rename, never reorder by hand.
- Order and document numbers stay TEXT (no 7.00001896146E+11).

REPORT TO ALI
- The header row of ME5K exactly as exported, and its row count.
- The header row of mb51 exactly as exported (check it has Order and
  Movement Type; if not, add them to the layout).
- The time each file will be uploaded every day.
