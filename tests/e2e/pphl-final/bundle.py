from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import json
root=Path(__file__).resolve().parents[3]
out=root/'output'/'pphl-final-testing-2026-11-05'
files=['READ-FIRST.txt','PPHL-final-testing-guide.pdf','PPHL-private-test-access.html','PPHL-acceptance-checklist.html','PPHL-checklist.json','PPHL-engineering-rehearsal.html','PPHL-engineering-rehearsal.json','harbor-hawks.png','fictional-membership-proof.png']
reports=['role-results.json','client-role-results.json','client-data-results.json','client-entry-results.json','registration-results.json','scheduling-results.json','regional-results.json','playoff-results.json','isolation-results.json','bulk70-results.json','membership-results.json','handoff-results.json','runtime-validation.json']
shots=['client-public-join','client-team-registration-entry','client-returning-player-start','captain-roster-after-registration','captain-actual-compliance','organization-draft-schedule','organization-conflict-check','captain-published-schedule','player-published-schedule','player-published-notification','regional-staff-review','regional-player-confirmed-schedule','regional-captain-confirmation','playoff-goal-assist-finalized','player-after-playoff-result','bulk70-paused','bulk70-completed','membership-required','membership-optional','handoff-checklist']
with ZipFile(out/'PPHL-final-testing-private.zip','w',ZIP_DEFLATED) as z:
 for name in files:
  assert (out/name).exists(),name
  z.write(out/name,name)
 for name in reports:
  assert (out/name).exists(),name
  z.write(out/name,'engineering-evidence/'+name)
 for name in shots:
  p=out/'evidence'/(name+'.png')
  assert p.exists(),p
  z.write(p,'engineering-evidence/screenshots/'+p.name)
with ZipFile(out/'PPHL-final-testing-private.zip') as z:
 assert z.testzip() is None
 assert not any('OWNER-ONLY' in n or '.private.json' in n for n in z.namelist())
print('Created private PPHL handoff bundle; owner-only and infrastructure credentials excluded.')
