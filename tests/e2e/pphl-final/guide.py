from pathlib import Path
import json
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT

root=Path(__file__).resolve().parents[3]
out=root/'output'/'pphl-final-testing-2026-11-05'
spec=json.loads((Path(__file__).parent/'checklist.json').read_text())
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitlePPHL',fontName='Helvetica-Bold',fontSize=27,leading=32,textColor=HexColor('#173b66'),spaceAfter=16))
styles.add(ParagraphStyle(name='SubPPHL',fontName='Helvetica-Bold',fontSize=14,leading=19,textColor=HexColor('#173b66'),spaceBefore=16,spaceAfter=8))
styles.add(ParagraphStyle(name='BodyPPHL',fontName='Helvetica',fontSize=10,leading=15,textColor=HexColor('#26364a'),spaceAfter=9))
styles.add(ParagraphStyle(name='SmallPPHL',fontName='Helvetica',fontSize=8.5,leading=12,textColor=HexColor('#52657b'),spaceAfter=6))
story=[]
def p(text,style='BodyPPHL'):return Paragraph(text,styles[style])
def add(text,style='BodyPPHL'):story.append(p(text,style))
def title(kicker,text):
 add(kicker.upper(),'SmallPPHL');add(text,'TitlePPHL')
def table(rows,widths):
 t=Table([[p(str(c),'SmallPPHL') for c in r] for r in rows],colWidths=widths,hAlign='LEFT')
 t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),HexColor('#eaf0f6')),('LINEBELOW',(0,0),(-1,-1),.5,HexColor('#dce2e8')),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]));story.append(t)
title('PPHL / Final testing / 5 November 2026','A connected testing round')
add('Purpose','SubPPHL')
add('Validate the eight changes in PPHL\'s 3 November Beta 2 letter, then follow the same season from registration to a published schedule and final result. PPHL records its own acceptance; engineering rehearsal results do not replace that decision.')
add('Working rules','SubPPHL')
add('<b>Staging only. Fictional records. Payments mock. Substitute fees and credits disabled.</b> Do not use real card details or import customer data. Real test email is restricted to the approved owner inbox; role accounts use in-app notifications.')
add('Prepared workspaces','SubPPHL')
table([['Workspace','What is available'],['PPHL Final Testing','3 leagues, 4 divisions, 16 original teams and 80 original roster members. North Metro and South Coast regions. Winter season: 16 November 2026 to 14 March 2027. Additional rehearsal records may appear.'],['Harbor Cup Setup Example','A saved guided-setup example with an uploaded logo, two copied divisions, separate playoff overtime and free team registration.'],['PPHL Scale Rehearsal','70 source leagues for configuration-copy testing. Separate operator account; no customer registrations or financial history.']],[140,359])
add('Files to use','SubPPHL')
add('<b>PPHL-private-test-access.html</b> contains temporary role credentials and working staging entry links. Keep it private. <b>PPHL-acceptance-checklist.html</b> saves results in your browser and exports a JSON results file. The owner-only platform-access file is excluded from the client handoff.')
add('Suggested round: one league operator, one captain, one player and one registrar/scorekeeper. Use separate private windows or browser profiles to keep role sessions distinct.','SmallPPHL')
story.append(PageBreak())
title('01 / People and boundaries','Use the right role')
table([['Role / persona','Starting task and allowed scope'],['Morgan Reed / Organization admin','Guided setup, registration configuration, scheduling and approvals across the testing organization.'],['Daniel Brooks / League admin','North Metro Weeknight Hockey only.'],['Olivia Chen / Season admin','Winter 2026-27 in that league only; other seasons must remain inaccessible.'],['Marcus Hall / Division admin','Adult Open only.'],['Emma Wilson / Registrar','Review registrations within the assigned season. No global admin or delivery data.'],['Noah Bennett / Scorekeeper','Scoresheets and game finalization in the assigned season.'],['Taylor Brooks / Referee','Restricted officials workspace; verify assigned duties.'],['Jordan Miller / Captain; Sam Rivera / Coach','Harbor Hawks roster and team workspace.'],['Ava Thompson / Player','Harbor Hawks schedule, own notifications and statistics.'],['Luca Martinez / Returning player','Offline player registration followed by two team registrations using the same account.'],['Maya Patel / Regional player','Metro Mavericks in another North Metro league; use for an approved regional substitute invitation.'],['Jamie Sullivan / Scale operator','The separate 70-league configuration rehearsal.']],[193,306])
add('Known scope limits','SubPPHL')
add('There is no dedicated parent dashboard in this round; guardian consent uses a direct consent link. Public spectator viewing needs an agreed scope. Neither role receives a private player or admin workspace. Internal platform super-admin and boundary-test accounts stay with the owner.')
add('Access checks','SubPPHL')
add('Try another league, season and organization from a narrow role. A denied request must reveal no foreign names, contact details or records. Treat a hidden menu alone as insufficient evidence.')
story.append(PageBreak())
title('02 / Against the Beta 2 letter','Eight acceptance checks')
for case in spec['cases'][:8]:
 compact=ParagraphStyle(name='CaseHead',parent=styles['SubPPHL'],fontSize=12,leading=16,spaceBefore=10,spaceAfter=5)
 body=ParagraphStyle(name='CaseBody',parent=styles['BodyPPHL'],fontSize=9,leading=12,spaceAfter=6)
 story.append(KeepTogether([Paragraph(case['id']+'  '+escape(case['letter'].split(' - ',1)[-1]),compact),Paragraph(escape(case['task']),body),p('<b>Pass when:</b> '+escape(case['expected']),'SmallPPHL')]))
story.append(PageBreak())
title('03 / One season across the apps','Run the complete journey')
steps=[('1. Discover and register','Open the public join link. Luca signs in, completes details and waivers, chooses cash/cheque and submits. Continue with Harbor United and Riverside Legends as separate free team registrations.'),('2. Review and verify destinations','Emma reviews the submissions in a fresh registrar session. Luca checks the approved registration; Jordan checks the resulting roster. Confirm that team registrations created no non-zero charges.'),('3. Schedule and notify','Morgan adds a holiday blackout, generates the selected division, reviews draft games and publishes. Fresh captain and player sessions must show the same venue, times and relevant in-app notices.'),('4. Score and inspect the result','The permitted scorekeeper enters events and finalizes the game. Inspect the final score, player statistics and standings from receiving accounts. A tied playoff final must be refused when a winner is required.'),('5. Fill a regional substitute request','Jordan requests help; an administrator approves the private invitation. Maya opts in and accepts from another league in the same region. Confirm one guest entry, correct eligibility and no fee or credit.'),('6. Recover and finish','Check refresh, failed-load retry and phone widths. Run one setup and one copy without live engineering guidance. Record elapsed time and every point where the operator needs help.')]
for heading,text in steps:story.append(KeepTogether([p(heading,'SubPPHL'),p(text)]))
add('Record and decide','SubPPHL')
add('For each case, select Pass, Fail or Blocked, name the tester and attach the role, page, expected result, actual result and screenshot. Export the checklist results. Resolve every blocker and major defect in the agreed launch flow before acceptance.')
add('Outside this sign-off','SubPPHL')
add('Live card settlement, substitute pricing, public spectator scope, a dedicated parent dashboard, SMS/push certification, AWS production cutover and the 10,000-user capacity target require separate validation. Supabase Free and Vercel Hobby remain in use for this staging round. A successful functional round is not a capacity certificate.','SmallPPHL')
def footer(canvas,doc):
 canvas.setStrokeColor(HexColor('#dce2e8'));canvas.line(48,42,547,42);canvas.setFont('Helvetica',8);canvas.setFillColor(HexColor('#52657b'));canvas.drawString(48,28,'SPORTSPULSE  /  PPHL FINAL TESTING  /  STAGING');canvas.drawRightString(547,28,str(doc.page))
doc=SimpleDocTemplate(str(out/'PPHL-final-testing-guide.pdf'),pagesize=(595,842),rightMargin=48,leftMargin=48,topMargin=42,bottomMargin=58,title='PPHL Final Testing Guide',author='SportsPulse',subject='Beta 2 acceptance testing')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print('Created PPHL final testing guide')
