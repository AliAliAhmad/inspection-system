DAILY FILE: EQT_Availability.xlsx

Every working day the planning team sends a mail saying which equipment is
available and which is not. Turn that mail into a small Excel file and put it
in the courier folder, so it is uploaded like the other files.

1. Find the mail. If you are not sure which mail it is, ask Ali first.

2. Make the file:
   Folder: Source file     Name: EQT_Availability.xlsx
   One row per machine in the mail. Row 1 = these headers:

   Equipment      machine code, upper case (TT058, RS109)
   Available      Yes or No
   Stop type      only when No:
                    WAITING_PARTS = stopped, waiting for spare parts
                    IN_PROGRESS   = work not finished, continues tomorrow
                    OTHER         = anything else, or not sure
   Reason         the reason exactly as written in the mail
   Mail received  date and time of the mail, YYYY-MM-DD HH:MM

3. Rules:
   - Never guess the stop type. Not sure = OTHER.
   - A new file replaces yesterday's. Never add to the old one.
   - No mail today = no file today.

4. Tell Ali: how many machines, how many Yes, how many No.
