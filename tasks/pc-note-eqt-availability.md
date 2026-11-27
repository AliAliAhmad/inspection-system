NEW FILE FOR THE COURIER: EQT_Availability.xlsx (daily)

Every working day the planning team sends a mail saying which equipment is
available and which is not. The server's planner needs this list.

STEP 1 - FIND AND DESCRIBE THE MAIL (do this first, change nothing)
- Find the planning team's daily equipment-availability mail. If you are not
  sure which mail it is, ask Ali before going on.
- Tell Ali: the subject, the sender, the time it usually arrives, and how the
  list is written (a table in the body, an attachment, or plain lines).
- Show 5 real rows exactly as written, including the reason text.

STEP 2 - BUILD THE FILE (after Ali says the mail is the right one)
File:   Source file / EQT_Availability.xlsx   (exact folder, exact name)
Sheet:  EQT Availability
Row 1 = these headers, exactly:

  A  Equipment       plant code as in SAP, upper case (e.g. TT058, RS109)
  B  Available       Yes or No
  C  Stop type       only for No rows. One of:
                       WAITING_PARTS - stopped, waiting for spare parts
                       IN_PROGRESS   - stopped, work not finished, continues
                       OTHER         - any other reason, or you are not sure
  D  Reason          the reason exactly as written in the mail (no rewording)
  E  Since           date the machine stopped, YYYY-MM-DD, if the mail says it
  F  Expected back   YYYY-MM-DD, if the mail says it, else empty
  G  Order           SAP order number as TEXT (12 digits), if the mail gives one
  H  Mail received   YYYY-MM-DD HH:MM, Iraq time, same on every row

Rules (each one matters):
- One row per machine in the mail, available AND not available.
- Never guess the stop type. If the reason does not clearly say parts or
  "work continues", write OTHER and keep the reason text in column D.
- Keep the order number as text, never a number (12 digits must not become
  7.00001896146E+11).
- A new file REPLACES yesterday's. Never add today's rows to yesterday's file.
- If the mail lists no machines, upload the file with the header row only.
- If no mail came today, upload nothing. The server will see the date is old.
- Upload with the courier the same way as PRM_Overdue.xlsx.

STEP 3 - CHECK BEFORE UPLOADING
Tell Ali, for today's mail: total rows, how many Yes, how many No, and how
many No rows of each stop type. The server must show the same numbers.
