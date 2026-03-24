/**
 * 대전관광공사 혁신드림제안제도 - Google Apps Script 백엔드
 *
 * [초기 설정]
 * 1. Google Sheets 새 파일 생성 → setupAllSheets() 실행하여 시트 자동 생성
 * 2. Google Drive 폴더 생성 → 폴더 ID 복사 → DRIVE_FOLDER_ID에 입력
 * 3. SHEET_ID에 Sheets 파일 ID 입력
 * 4. 배포: 확장 프로그램 → Apps Script → 배포 → 새 배포 → 웹 앱
 *    - 액세스: 모든 사용자 (익명 포함)
 *    - 배포 URL을 index.html의 SCRIPT_URL에 입력
 */

const SHEET_ID        = '';  // ← Google Sheet ID 입력
const DRIVE_FOLDER_ID = '';  // ← Google Drive 폴더 ID 입력
const ADMIN_PW        = 'alsk0118**';

const S_PROPOSAL = '제안';
const S_REVIEW   = '검토';
const S_SCORE    = '심사';
const S_CODE     = '코드관리';

// ══════════════════════════════════════════
// GET 라우터
// ══════════════════════════════════════════
function doGet(e) {
  const p = e.parameter;
  let result;
  try {
    switch (p.action) {
      case 'getProposals':      result = getProposals(); break;
      case 'getProposalsAdmin': result = checkAdmin(p.pw) ? getProposalsAdmin() : {error:'권한 없음'}; break;
      case 'verifyCode':        result = verifyCode(p.code); break;
      case 'getReviewsByCode':  result = getReviewsByCode(p.code); break;
      case 'getScoresByCode':   result = getScoresByCode(p.code); break;
      case 'getStats':          result = getStats(); break;
      case 'getCodes':          result = checkAdmin(p.pw) ? getCodes() : {error:'권한 없음'}; break;
      case 'getScoreSummary':   result = checkAdmin(p.pw) ? getScoreSummary(p.proposalId) : {error:'권한 없음'}; break;
      default:                  result = {error: 'Unknown action'};
    }
  } catch(err) {
    result = {error: err.message};
  }
  return json(result);
}

// ══════════════════════════════════════════
// POST 라우터
// ══════════════════════════════════════════
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  let result;
  try {
    switch (d.action) {
      case 'submitProposal':  result = submitProposal(d); break;
      case 'saveReview':      result = saveReview(d); break;
      case 'saveScore':       result = saveScore(d); break;
      case 'updateProposal':  result = checkAdmin(d.pw) ? updateProposal(d) : {error:'권한 없음'}; break;
      case 'deleteProposal':  result = checkAdmin(d.pw) ? deleteProposal(d.id) : {error:'권한 없음'}; break;
      case 'manageCode':      result = checkAdmin(d.pw) ? manageCode(d) : {error:'권한 없음'}; break;
      case 'updateAward':     result = checkAdmin(d.pw) ? updateAward(d) : {error:'권한 없음'}; break;
      case 'bulkUpdateAward': result = checkAdmin(d.pw) ? bulkUpdateAward(d) : {error:'권한 없음'}; break;
      default:                result = {error: 'Unknown action'};
    }
  } catch(err) {
    result = {error: err.message};
  }
  return json(result);
}

// ══════════════════════════════════════════
// 헬퍼
// ══════════════════════════════════════════
function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
function checkAdmin(pw) { return pw === ADMIN_PW; }
function ss()  { return SpreadsheetApp.openById(SHEET_ID); }
function sheet(name) {
  const s = ss().getSheetByName(name);
  if (!s) throw new Error('시트를 찾을 수 없습니다: ' + name);
  return s;
}
function uid() { return Utilities.getUuid().replace(/-/g,'').substring(0,12); }
function now() { return new Date().toISOString(); }

function sheetToObjects(sheetName) {
  const s = sheet(sheetName);
  const data = s.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).filter(r => r[0] !== '').map((r, i) => {
    const obj = { _rowIndex: i + 2 };
    headers.forEach((h, ci) => { obj[h] = r[ci]; });
    return obj;
  });
}

function saveToSheet(sheetName, rowObj) {
  const s = sheet(sheetName);
  const headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  const row = headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');
  s.appendRow(row);
}

function updateRowById(sheetName, id, updates) {
  const s = sheet(sheetName);
  const data = s.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      Object.keys(updates).forEach(key => {
        const col = headers.indexOf(key);
        if (col >= 0) s.getRange(i + 1, col + 1).setValue(updates[key]);
      });
      return true;
    }
  }
  return false;
}

function deleteRowById(sheetName, id) {
  const s = sheet(sheetName);
  const data = s.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idCol]) === String(id)) {
      s.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function saveToDrive(base64Data, fileName, mimeType, subFolder) {
  let folder;
  try {
    folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  } catch(e) {
    folder = DriveApp.getRootFolder();
  }
  if (subFolder) {
    const subs = folder.getFoldersByName(subFolder);
    folder = subs.hasNext() ? subs.next() : folder.createFolder(subFolder);
  }
  const decoded = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decoded, mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { fileId: file.getId(), driveUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId() };
}

function initSheet(name, headers) {
  let s = ss().getSheetByName(name);
  if (!s) {
    s = ss().insertSheet(name);
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8edf5');
  } else {
    const existing = s.getRange(1, 1, 1, Math.max(s.getLastColumn(), 1)).getValues()[0].filter(h => h !== '');
    const missing = headers.filter(h => existing.indexOf(h) < 0);
    if (missing.length > 0) {
      const startCol = existing.length + 1;
      s.getRange(1, startCol, 1, missing.length).setValues([missing]);
    }
  }
  return s;
}

function setupAllSheets() {
  initSheet(S_PROPOSAL, ['id','title','proposer','dept','date','category','targetDept','reason','method','effectSave','effectRevenue','effectEtc','summary','keywords','fileId','driveUrl','fileName','status','award','submittedAt']);
  initSheet(S_REVIEW, ['id','proposalId','proposalTitle','reviewer','reviewDept','opinion','code','submittedAt']);
  initSheet(S_SCORE, ['id','proposalId','proposalTitle','judgeCode','feasibility','creativity','effectiveness','efficiency','scope','duration','effort','total','submittedAt']);
  initSheet(S_CODE, ['id','type','code','label','targetYear','assignedTo','createdAt']);
}

// ══════════════════════════════════════════
// 제안 조회
// ══════════════════════════════════════════
function getProposals() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('proposals');
  if (cached) return JSON.parse(cached);
  const rows = sheetToObjects(S_PROPOSAL);
  const pub = rows.map(r => ({
    id: r.id, title: r.title, date: r.date, category: r.category,
    targetDept: r.targetDept, summary: r.summary, keywords: r.keywords,
    status: r.status, award: r.award, fileName: r.fileName,
    driveUrl: r.driveUrl, submittedAt: r.submittedAt
  }));
  try { cache.put('proposals', JSON.stringify(pub), 300); } catch(e) {}
  return pub;
}

function getProposalsAdmin() {
  return sheetToObjects(S_PROPOSAL);
}

// ══════════════════════════════════════════
// 제안 접수
// ══════════════════════════════════════════
function submitProposal(d) {
  initSheet(S_PROPOSAL, ['id','title','proposer','dept','date','category','targetDept','reason','method','effectSave','effectRevenue','effectEtc','summary','keywords','fileId','driveUrl','fileName','status','award','submittedAt']);

  let fileId = '', driveUrl = '', fName = '';
  if (d.fileData && d.fileName) {
    const result = saveToDrive(d.fileData, d.fileName, d.fileType || 'application/octet-stream', '제안서');
    fileId = result.fileId;
    driveUrl = result.driveUrl;
    fName = d.fileName;
  }

  const id = uid();
  const summary = '● ' + (d.reason || '').split('\n').filter(Boolean).join('\n● ')
    + '\n● ' + (d.method || '').split('\n').filter(Boolean).join('\n● ');

  saveToSheet(S_PROPOSAL, {
    id: id,
    title: d.title || '',
    proposer: d.proposer || '',
    dept: d.dept || '',
    date: d.date || '',
    category: d.category || '',
    targetDept: d.targetDept || '',
    reason: d.reason || '',
    method: d.method || '',
    effectSave: d.effectSave || '',
    effectRevenue: d.effectRevenue || '',
    effectEtc: d.effectEtc || '',
    summary: summary,
    keywords: d.keywords || '',
    fileId: fileId,
    driveUrl: driveUrl,
    fileName: fName,
    status: '접수완료',
    award: '심사중',
    submittedAt: now()
  });

  CacheService.getScriptCache().remove('proposals');
  return { ok: true, id: id };
}

// ══════════════════════════════════════════
// 제안 수정/삭제 (관리자)
// ══════════════════════════════════════════
function updateProposal(d) {
  const updates = {};
  ['title','category','targetDept','summary','keywords','status','award','date'].forEach(k => {
    if (d[k] !== undefined) updates[k] = d[k];
  });
  updateRowById(S_PROPOSAL, d.id, updates);
  CacheService.getScriptCache().remove('proposals');
  return { ok: true };
}

function deleteProposal(id) {
  deleteRowById(S_PROPOSAL, id);
  CacheService.getScriptCache().remove('proposals');
  return { ok: true };
}

function updateAward(d) {
  updateRowById(S_PROPOSAL, d.id, { award: d.award });
  CacheService.getScriptCache().remove('proposals');
  return { ok: true };
}

function bulkUpdateAward(d) {
  (d.ids || []).forEach(id => {
    updateRowById(S_PROPOSAL, id, { award: d.award });
  });
  CacheService.getScriptCache().remove('proposals');
  return { ok: true };
}

// ══════════════════════════════════════════
// 코드 관리 (관리자)
// ══════════════════════════════════════════
function getCodes() {
  return sheetToObjects(S_CODE);
}

function manageCode(d) {
  if (d.op === 'create') {
    initSheet(S_CODE, ['id','type','code','label','targetYear','assignedTo','createdAt']);
    const code = d.code || (d.type === 'review' ? 'review-' : 'judge-') + uid().substring(0,6);
    saveToSheet(S_CODE, {
      id: uid(),
      type: d.type,
      code: code,
      label: d.label || '',
      targetYear: d.targetYear || '',
      assignedTo: d.assignedTo || '',
      createdAt: now()
    });
    return { ok: true, code: code };
  }
  if (d.op === 'delete') {
    deleteRowById(S_CODE, d.id);
    return { ok: true };
  }
  return { error: 'Unknown op' };
}

// ══════════════════════════════════════════
// 코드 검증
// ══════════════════════════════════════════
function verifyCode(code) {
  if (!code) return { ok: false, error: '코드를 입력하세요' };
  const codes = sheetToObjects(S_CODE);
  const found = codes.find(c => String(c.code).trim().toLowerCase() === String(code).trim().toLowerCase());
  if (!found) return { ok: false, error: '유효하지 않은 코드입니다' };
  return { ok: true, type: found.type, label: found.label, targetYear: found.targetYear, codeId: found.id };
}

// ══════════════════════════════════════════
// 검토 (검토코드)
// ══════════════════════════════════════════
function getReviewsByCode(code) {
  const v = verifyCode(code);
  if (!v.ok) return v;
  if (v.type !== 'review') return { error: '검토코드가 아닙니다' };

  const proposals = sheetToObjects(S_PROPOSAL);
  const reviews = sheetToObjects(S_REVIEW);
  const filtered = v.targetYear
    ? proposals.filter(p => String(p.date).indexOf(v.targetYear) >= 0)
    : proposals;

  return {
    ok: true,
    label: v.label,
    proposals: filtered.map(p => ({
      id: p.id, title: p.title, category: p.category, summary: p.summary,
      existingReview: reviews.find(r => r.proposalId === p.id && r.code === code)
    }))
  };
}

function saveReview(d) {
  const v = verifyCode(d.code);
  if (!v.ok) return v;
  if (v.type !== 'review') return { error: '검토코드가 아닙니다' };

  initSheet(S_REVIEW, ['id','proposalId','proposalTitle','reviewer','reviewDept','opinion','code','submittedAt']);

  // 기존 검토가 있으면 업데이트
  const reviews = sheetToObjects(S_REVIEW);
  const existing = reviews.find(r => r.proposalId === d.proposalId && r.code === d.code);
  if (existing) {
    updateRowById(S_REVIEW, existing.id, { opinion: d.opinion, submittedAt: now() });
    return { ok: true, updated: true };
  }

  saveToSheet(S_REVIEW, {
    id: uid(),
    proposalId: d.proposalId,
    proposalTitle: d.proposalTitle || '',
    reviewer: d.reviewer || '',
    reviewDept: d.reviewDept || '',
    opinion: d.opinion,
    code: d.code,
    submittedAt: now()
  });
  return { ok: true };
}

// ══════════════════════════════════════════
// 심사 (심사코드)
// ══════════════════════════════════════════
function getScoresByCode(code) {
  const v = verifyCode(code);
  if (!v.ok) return v;
  if (v.type !== 'judge') return { error: '심사코드가 아닙니다' };

  const proposals = sheetToObjects(S_PROPOSAL);
  const scores = sheetToObjects(S_SCORE);
  const filtered = v.targetYear
    ? proposals.filter(p => String(p.date).indexOf(v.targetYear) >= 0)
    : proposals;

  return {
    ok: true,
    label: v.label,
    proposals: filtered.map(p => ({
      id: p.id, title: p.title, category: p.category, summary: p.summary,
      existingScore: scores.find(s => s.proposalId === p.id && s.judgeCode === code)
    }))
  };
}

function saveScore(d) {
  const v = verifyCode(d.code);
  if (!v.ok) return v;
  if (v.type !== 'judge') return { error: '심사코드가 아닙니다' };

  initSheet(S_SCORE, ['id','proposalId','proposalTitle','judgeCode','feasibility','creativity','effectiveness','efficiency','scope','duration','effort','total','submittedAt']);

  const total = (Number(d.feasibility)||0) + (Number(d.creativity)||0) + (Number(d.effectiveness)||0)
    + (Number(d.efficiency)||0) + (Number(d.scope)||0) + (Number(d.duration)||0) + (Number(d.effort)||0);

  // 기존 심사가 있으면 업데이트
  const scores = sheetToObjects(S_SCORE);
  const existing = scores.find(s => s.proposalId === d.proposalId && s.judgeCode === d.code);
  if (existing) {
    updateRowById(S_SCORE, existing.id, {
      feasibility: d.feasibility, creativity: d.creativity,
      effectiveness: d.effectiveness, efficiency: d.efficiency,
      scope: d.scope, duration: d.duration, effort: d.effort,
      total: total, submittedAt: now()
    });
    return { ok: true, total: total, updated: true };
  }

  saveToSheet(S_SCORE, {
    id: uid(),
    proposalId: d.proposalId,
    proposalTitle: d.proposalTitle || '',
    judgeCode: d.code,
    feasibility: d.feasibility || 0,
    creativity: d.creativity || 0,
    effectiveness: d.effectiveness || 0,
    efficiency: d.efficiency || 0,
    scope: d.scope || 0,
    duration: d.duration || 0,
    effort: d.effort || 0,
    total: total,
    submittedAt: now()
  });
  return { ok: true, total: total };
}

// 심사 점수 요약 (관리자)
function getScoreSummary(proposalId) {
  const scores = sheetToObjects(S_SCORE).filter(s => s.proposalId === proposalId);
  if (scores.length === 0) return { count: 0, avg: 0, scores: [] };
  const avg = scores.reduce((sum, s) => sum + Number(s.total), 0) / scores.length;
  return {
    count: scores.length,
    avg: Math.round(avg * 10) / 10,
    scores: scores.map(s => ({
      judgeCode: s.judgeCode, total: s.total,
      feasibility: s.feasibility, creativity: s.creativity,
      effectiveness: s.effectiveness, efficiency: s.efficiency,
      scope: s.scope, duration: s.duration, effort: s.effort,
      submittedAt: s.submittedAt
    }))
  };
}

// ══════════════════════════════════════════
// 통계
// ══════════════════════════════════════════
function getStats() {
  const proposals = sheetToObjects(S_PROPOSAL);
  const total = proposals.length;
  const adopted = proposals.filter(p => p.award && p.award !== '심사중' && p.award !== '미채택').length;
  const pending = proposals.filter(p => p.award === '심사중').length;
  const byYear = {};
  const byCat = {};
  proposals.forEach(p => {
    const yr = String(p.date).substring(0,4) || '기타';
    byYear[yr] = byYear[yr] || { total: 0, adopted: 0 };
    byYear[yr].total++;
    if (p.award && p.award !== '심사중' && p.award !== '미채택') byYear[yr].adopted++;
    const cat = p.category || '기타';
    byCat[cat] = (byCat[cat] || 0) + 1;
  });
  return { total, adopted, pending, byYear, byCat };
}