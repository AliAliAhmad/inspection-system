COURIER: SAP FILES THE SERVER NEEDS (missing or not fresh enough)

The server's planner will use SAP's parts data to know when a job is waiting
for a part and when the part has arrived. Some files are missing, some arrive
too rarely. Do the steps in order. Change nothing else in the courier.

STEP 1 - CHECK WHAT YOU SEND TODAY (change nothing)
For each file below, tell Ali: does the courier send it, how often, from
which SAP transaction/layout, and how many rows it has on a normal day.
  IW39 YTD.XLSX, IW49 YTD.XLSX, IK17 YTD.XLSX, Backlog.XLSX,
  ME5A ytd.XLSX, ME2L ytd.XLSX, mb51 ytd.XLSX, mb52.XLSX

STEP 2 - NEW FILE: ME5K (purchase requisitions by account assignment)
- Transaction ME5K, account assignment category F (order), plant as today.
- Layout must include at least these columns (SAP names may differ a little,
  keep SAP's own header text, do not rename):
    Purchase Requisition, Item of Requisition, Order (work order number),
    Material, Short Text, Quantity Requested, Unit of Measure,
    Requisition Date, Delivery Date, Purchase Order, Purchase Order Item,
    Processing status, Deletion Indicator, Release Indicator
- Open AND closed requisitions of the last 12 months (closed ones tell the
  server a part was already bought/received).
- File: sap_import / ME5K.XLSX   sheet_name for the upload: ME5K
- Daily, after the other SAP files.

STEP 3 - MAKE THESE DAILY (today some are days old)
- mb51 ytd.XLSX (goods movements) - DAILY. Must include: Material,
  Movement Type, Posting Date, Quantity, Order, Purchase Order, Item,
  Plant, Storage Location, Material Document. This is how the server
  knows a part ARRIVED (movement 101) or was GIVEN TO A JOB (261).
- ME2L ytd.XLSX (purchase orders, still to be delivered) - DAILY.
- mb52.XLSX (stock on hand) - DAILY.
- ME5A ytd.XLSX - DAILY.
- Backlog.XLSX - DAILY (it already arrived today 20:10; keep it daily).

STEP 4 - IW39 MUST REACH BACK 12 MONTHS
- Today the file is "IW39 YTD" (this year only). On 1 January every machine
  would look like it was never serviced. Export a ROLLING 12 months
  (today minus 365 days to today) instead. Keep the same columns and the
  same file name, so nothing on the server breaks.

RULES (each one matters)
- Keep SAP's own column headers. Never rename, never reorder by hand.
- Keep order and document numbers as TEXT (12 digits must not become
  7.00001896146E+11).
- Keep the same folder (sap_import) and the same file names, so the server
  finds them. A new upload replaces the old copy.
- Excel (.XLSX) is fine. Do not split one export into several files.
- Do NOT send private HR files to the server unless Ali asks (salaries,
  ratings, biometric attendance).

STEP 5 - REPORT TO ALI
For each file: sent yes/no, how often, row count today, and the header row
of ME5K and mb51 exactly as exported.
