// ══════════════════════════════════════════════════════════
// ██  제안실행상 접수  ██
//   - 대상: 2025년 하반기 · 2026년 상반기 제안 (통합관리대장 DATA에서 드롭다운 구성)
//   - 제출: 제안실행자(팀) / 실행 개요 / 증빙 자료
//   - 서버: Apps Script  dreamExecSubmit → dreamExecSaveFile(파일별)
//   script.js 의 DATA, apiPost, fileToBase64, showLoadingOverlay, switchTab 을 사용합니다.
// ══════════════════════════════════════════════════════════

// 접수 대상 기간 — 순번 앞 4자리(연도) → 표시 이름
var EXEC_TARGETS = { '2025': '2025년 하반기 제안', '2026': '2026년 상반기 제안' };
// 연도 중 접수 대상이 시작되는 순번 — 2025년은 2025-41부터가 하반기 제안 (2025-01~40은 상반기라 제외)
var EXEC_MIN_NO = { '2025': 41 };

var EXEC_MAX_FILE = 15 * 1024 * 1024;   // 파일당 15MB
var EXEC_MAX_TOTAL = 40 * 1024 * 1024;  // 전체 40MB
// 모든 형식 허용, 단 실행·스크립트 파일은 보안상 제외
var EXEC_BLOCKED = ['exe','bat','cmd','com','scr','msi','dll','js','jse','vbs','vbe','wsf','ps1','jar','lnk','reg','apk','sh'];

var _execRetry = 0; // 대상 제안 목록 로딩 재시도 횟수

function execEsc_(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// [실행상 접수] 탭 진입 시 호출 — 폼 초기화 + 대상 제안 목록 구성
function initExecTab() {
  var done = document.getElementById('exec-done');
  if (done) done.style.display = 'none';
  document.querySelectorAll('#tab-exec .card > *:not(#exec-done)').forEach(function(e) { e.style.display = ''; });
  clearExecForm_();
  buildExecProposalOptions_();
}

function clearExecForm_() {
  ['ex-name','ex-team','ex-summary','ex-result','ex-link','ex-start','ex-end'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  ['ex-proposal','ex-dept'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.selectedIndex = 0;
  });
  var fe = document.getElementById('ex-files'); if (fe) fe.value = '';
  var pk = document.getElementById('ex-picked'); if (pk) pk.innerHTML = '';
  var typeInd = document.querySelector('input[name="ex-type"][value="개인"]');
  if (typeInd) typeInd.checked = true;
  document.querySelectorAll('input[name="ex-status"]').forEach(function(r) { r.checked = false; });
  var list = document.getElementById('ex-members-list');
  if (list) list.innerHTML = '';
  var meta = document.getElementById('ex-proposal-meta');
  if (meta) meta.textContent = '';
  toggleExecType();
  onExecStatusChange();
}

// 통합관리대장(DATA)에서 2025·2026 제안만 뽑아 드롭다운 구성
function buildExecProposalOptions_() {
  var sel = document.getElementById('ex-proposal');
  if (!sel) return;
  if (!DATA_LOADED) {
    sel.innerHTML = '<option value="">제안 목록을 불러오는 중...</option>';
    if (_execRetry < 20) { _execRetry++; setTimeout(buildExecProposalOptions_, 500); }
    return;
  }
  _execRetry = 0;

  // 통합관리대장(Sheet1) 행만 대상 — 서버가 순번 대신 legacy_행번호를 주므로,
  // 연도별로 행 순서대로 번호를 매겨 '2025-01' 형식 표시번호를 만든다. (execLedgerGroups_ 참고)
  var groups = execLedgerGroups_();

  var html = '<option value="">-- 제안을 선택하세요 --</option>';
  Object.keys(EXEC_TARGETS).sort().forEach(function(yr) {
    var list = groups[yr] || [];
    if (!list.length) return;
    html += '<optgroup label="' + execEsc_(EXEC_TARGETS[yr]) + ' (' + list.length + '건)">';
    list.forEach(function(p) {
      var aw = p.award ? ' [' + p.award + ']' : '';
      html += '<option value="' + execEsc_(p.id) + '" data-title="' + execEsc_(p.title) + '" data-cat="' + execEsc_(p.category) + '" data-award="' + execEsc_(p.award) + '">'
            + execEsc_(p.id + ' · ' + p.title + aw) + '</option>';
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
}

function onExecProposalChange() {
  var sel = document.getElementById('ex-proposal');
  var meta = document.getElementById('ex-proposal-meta');
  if (!sel || !meta) return;
  var opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { meta.textContent = ''; return; }
  var yr = opt.value.substring(0, 4);
  meta.textContent = '선택: ' + (EXEC_TARGETS[yr] || '') + ' · ' + (opt.getAttribute('data-cat') || '')
    + (opt.getAttribute('data-award') ? ' · ' + opt.getAttribute('data-award') : '');
}

// 개인 / 그룹 전환
function toggleExecType() {
  var sel = document.querySelector('input[name="ex-type"]:checked');
  var type = sel ? sel.value : '개인';
  var nameLabel = document.getElementById('ex-name-label');
  var deptLabel = document.getElementById('ex-dept-label');
  var groupArea = document.getElementById('ex-group-area');
  if (type === '그룹') {
    if (nameLabel) nameLabel.innerHTML = '대표자 성명 <span class="field-req">*</span>';
    if (deptLabel) deptLabel.innerHTML = '대표자 소속 <span class="field-req">*</span>';
    if (groupArea) {
      groupArea.style.display = '';
      if (!document.querySelector('#ex-members-list .sf-member-row')) addExecMemberRow();
    }
  } else {
    if (nameLabel) nameLabel.innerHTML = '성명 <span class="field-req">*</span>';
    if (deptLabel) deptLabel.innerHTML = '소속 <span class="field-req">*</span>';
    if (groupArea) groupArea.style.display = 'none';
  }
}

function addExecMemberRow() {
  var list = document.getElementById('ex-members-list');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'sf-member-row';
  row.innerHTML = '<input type="text" class="ex-member-name" placeholder="이름"><button type="button" onclick="this.parentElement.remove()">✕</button>';
  list.appendChild(row);
}

// 추진 상태에 따라 종료일 문구 변경
function onExecStatusChange() {
  var sel = document.querySelector('input[name="ex-status"]:checked');
  var st = sel ? sel.value : '';
  var endLabel = document.getElementById('ex-end-label');
  if (endLabel) endLabel.innerHTML = (st === '완료' ? '종료일' : '종료(예정)일') + ' <span class="field-req">*</span> <span class="lbl-hint">(연도-월)</span>';
}

// 선택한 증빙 파일 목록 표시
function showExecPicked() {
  var input = document.getElementById('ex-files');
  var box = document.getElementById('ex-picked');
  if (!input || !box) return;
  var fs = Array.prototype.slice.call(input.files || []);
  if (!fs.length) { box.innerHTML = ''; return; }
  var total = 0;
  var html = fs.map(function(f) { total += f.size; return '📄 ' + execEsc_(f.name) + ' (' + execFmtSize_(f.size) + ')'; }).join('<br>');
  box.innerHTML = html + '<br><b>총 ' + fs.length + '개 · ' + execFmtSize_(total) + '</b>';
}

function execFileExt_(name) {
  var i = String(name || '').lastIndexOf('.');
  return i < 0 ? '' : name.substring(i + 1).toLowerCase();
}

function execFmtSize_(n) {
  return n < 1024 * 1024 ? Math.round(n / 1024) + 'KB' : (n / (1024 * 1024)).toFixed(1) + 'MB';
}

// ── 접수 ────────────────────────────────────────────────
function submitExecution() {
  var propSel = document.getElementById('ex-proposal');
  var propOpt = propSel && propSel.options[propSel.selectedIndex];
  var proposalNo = propOpt ? propOpt.value : '';
  var proposalTitle = propOpt ? (propOpt.getAttribute('data-title') || '') : '';

  var typeEl = document.querySelector('input[name="ex-type"]:checked');
  var type = typeEl ? typeEl.value : '개인';
  var name = (document.getElementById('ex-name').value || '').trim();
  var dept = (document.getElementById('ex-dept').value || '').trim();
  var team = (document.getElementById('ex-team').value || '').trim();
  var members = [];
  if (type === '그룹') {
    members = Array.prototype.slice.call(document.querySelectorAll('#ex-members-list .ex-member-name'))
      .map(function(i) { return (i.value || '').trim(); }).filter(Boolean);
  }
  var stEl = document.querySelector('input[name="ex-status"]:checked');
  var status = stEl ? stEl.value : '';
  var start = document.getElementById('ex-start').value;
  var end = document.getElementById('ex-end').value;
  var summary = (document.getElementById('ex-summary').value || '').trim();
  var result = (document.getElementById('ex-result').value || '').trim();
  var link = (document.getElementById('ex-link').value || '').trim();

  var pickedFiles = Array.prototype.slice.call(document.getElementById('ex-files').files || []);

  // 필수 검증
  if (!proposalNo) return alert('실행한 제안을 선택해주세요.');
  if (!name) return alert(type === '그룹' ? '대표자 성명을 입력해주세요.' : '성명을 입력해주세요.');
  if (!dept) return alert(type === '그룹' ? '대표자 소속을 선택해주세요.' : '소속을 선택해주세요.');
  if (type === '그룹' && members.length === 0) return alert('그룹 신청은 함께한 분을 1명 이상 입력해주세요.');
  if (!status) return alert('추진 상태(진행 중/완료)를 선택해주세요.');
  if (!start) return alert('추진 시작일을 입력해주세요.');
  if (!end) return alert(status === '완료' ? '종료일을 입력해주세요.' : '종료(예정)일을 입력해주세요.');
  if (end < start) return alert('종료일이 시작일보다 앞설 수 없습니다.');
  if (!summary) return alert('실행 개요를 입력해주세요.');
  if (!result) return alert('주요 성과를 입력해주세요.');
  if (!pickedFiles.length) return alert('증빙자료를 1개 이상 첨부해주세요.\n(사업계획서, 결과보고서, 기타 증빙자료 등)');
  if (link && !/^https?:\/\//i.test(link)) return alert('증빙 링크는 http:// 또는 https:// 로 시작해야 합니다.');

  // 파일 검증
  var files = pickedFiles.map(function(f) { return { kind: '증빙자료', file: f }; });
  var total = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i].file;
    if (EXEC_BLOCKED.indexOf(execFileExt_(f.name)) >= 0) return alert('보안상 첨부할 수 없는 파일 형식입니다 (실행·스크립트 파일): ' + f.name);
    if (f.size > EXEC_MAX_FILE) return alert('파일이 15MB를 넘습니다: ' + f.name + ' (' + execFmtSize_(f.size) + ')\n큰 파일은 증빙 링크로 제출해주세요.');
    total += f.size;
  }
  if (total > EXEC_MAX_TOTAL) return alert('첨부 파일 전체 크기가 40MB를 넘습니다. (' + execFmtSize_(total) + ')');
  if (!SCRIPT_URL) return alert('Apps Script가 연결되지 않았습니다.');

  if (!confirm('"' + proposalTitle + '"\n제안실행상을 접수하시겠습니까?\n\n(접수 후에는 직접 수정할 수 없습니다. 보완이 필요하면 담당자에게 문의하세요.)')) return;

  var btn = document.getElementById('ex-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '접수 중...'; }
  showLoadingOverlay('제안실행상 접수 중...');

  var execNo = '', token = '';
  apiPost({
    action: 'dreamExecSubmit',
    proposalNo: proposalNo, proposalTitle: proposalTitle,
    type: type, name: name, dept: dept, team: team, members: members,
    status: status, startDate: start, endDate: end,
    summary: summary, result: result, link: link,
    fileCount: files.length
  }).then(function(res) {
    if (!res || !res.ok || !res.execNo) throw new Error((res && res.error) || '접수 실패 (서버를 확인해주세요)');
    execNo = res.execNo; token = res.token || '';
    return uploadExecFiles_(execNo, token, files);
  }).then(function(failed) {
    hideLoadingOverlay();
    if (btn) { btn.disabled = false; btn.textContent = '제안실행상 접수'; }
    if (failed.length) {
      alert('⚠️ 접수는 완료됐으나 일부 파일 업로드에 실패했습니다.\n\n'
        + failed.map(function(x) { return '  • ' + x; }).join('\n')
        + '\n\n담당자에게 접수번호(' + execNo + ')와 함께 해당 파일을 전달해주세요.');
    }
    showExecDone_(execNo, proposalNo, proposalTitle, name, type, team);
  }).catch(function(e) {
    hideLoadingOverlay();
    if (btn) { btn.disabled = false; btn.textContent = '제안실행상 접수'; }
    alert('❌ 오류: ' + e.message + (execNo ? '\n접수번호: ' + execNo + ' (담당자에게 문의)' : ''));
  });
}

// 파일을 한 개씩 순서대로 업로드 — 실패한 파일명 목록 반환
function uploadExecFiles_(execNo, token, files) {
  var failed = [];
  var chain = Promise.resolve();
  files.forEach(function(item, idx) {
    chain = chain.then(function() {
      showLoadingOverlay('증빙 업로드 중... (' + (idx + 1) + '/' + files.length + ') ' + item.file.name);
      return fileToBase64(item.file).then(function(b64) {
        return apiPost({
          action: 'dreamExecSaveFile',
          execNo: execNo, token: token,
          kind: item.kind, fileName: item.file.name, mime: item.file.type || '', base64: b64
        });
      }).then(function(r) {
        if (!r || r.ok !== true || !r.url) failed.push(item.file.name);
      }).catch(function() { failed.push(item.file.name); });
    });
  });
  return chain.then(function() { return failed; });
}

function showExecDone_(execNo, proposalNo, proposalTitle, name, type, team) {
  document.querySelectorAll('#tab-exec .card > *:not(#exec-done)').forEach(function(e) { e.style.display = 'none'; });
  var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
  set('ex-done-no', execNo);
  set('ex-done-title', proposalNo + ' · ' + proposalTitle);
  set('ex-done-name', type === '그룹' && team ? team + ' (' + name + ' 외)' : name);
  var done = document.getElementById('exec-done');
  if (done) done.style.display = 'block';
  window.scrollTo(0, 0);
}


// ══════════════════════════════════════════════════════════
// ██  공통: 대상 제안(원장) 목록 — 접수 드롭다운·심사 화면의 원 제안서 보기에서 같이 사용  ██
// ══════════════════════════════════════════════════════════
function execLedgerGroups_() {
  var groups = {};
  if (!window.DATA_LOADED) return groups;
  DATA.forEach(function(d) {
    var yr = String(d.period || '');
    if (!EXEC_TARGETS[yr] || String(d.source) !== 'legacy') return;
    var rowNo = parseInt(String(d.id).replace(/\D/g, ''), 10) || 0;
    (groups[yr] = groups[yr] || []).push({ rowNo: rowNo, title: d.title || '', category: d.category || '', award: d.award || '', pdf: d.pdf || '' });
  });
  Object.keys(groups).forEach(function(yr) {
    groups[yr].sort(function(a, b) { return a.rowNo - b.rowNo; });
    groups[yr].forEach(function(p, i) {
      p.no = i + 1;
      p.id = yr + '-' + (i < 9 ? '0' : '') + (i + 1);
    });
    var minNo = EXEC_MIN_NO[yr] || 1;
    groups[yr] = groups[yr].filter(function(p) { return p.no >= minNo; });
  });
  return groups;
}

// 제안 번호(예: 2025-41) → 원장 행(제목, 원 제안서 PDF 경로)
function execFindLedger_(proposalNo) {
  var g = execLedgerGroups_();
  var yr = String(proposalNo || '').substring(0, 4);
  var list = g[yr] || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === proposalNo) return list[i];
  return null;
}

function execDriveId_(url) {
  var m = String(url || '').match(/\/d\/([A-Za-z0-9_-]+)/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

function execWho_(it) {
  var who = it.type === '그룹'
    ? (it.team ? it.team + ' (' + it.name + (it.members ? ' 외 ' + it.members.split(',').length + '명' : '') + ')' : it.name + (it.members ? ' 외 ' + it.members.split(',').length + '명' : ''))
    : it.name;
  return who;
}

function execPeriodText_(it) {
  return (it.startDate || '') + ' ~ ' + (it.endDate || '') + (it.progress === '진행중' ? ' (예정)' : '');
}

// ══════════════════════════════════════════════════════════
// ██  접수 확인 탭 — 제안 / 실행상 전환 + 실행상 접수 현황(공개)  ██
// ══════════════════════════════════════════════════════════
var _execStatusItems = [];

// 기존 [제안 접수 확인] 초기화를 감싸서, 탭에 들어올 때마다 '제안' 쪽으로 시작
(function() {
  var orig = window.initMineTab;
  window.initMineTab = function() {
    if (typeof orig === 'function') orig();
    showMineSubUI_('proposal');
  };
})();

function showMineSubUI_(which) {
  var isExec = which === 'exec';
  var card = document.getElementById('exec-status-card');
  if (card) card.style.display = isExec ? '' : 'none';
  ['mine-list-card', 'mine-auth-card', 'mine-result'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && isExec) el.style.display = 'none';
  });
  var bp = document.getElementById('mine-sub-proposal');
  var be = document.getElementById('mine-sub-exec');
  if (bp) bp.classList.toggle('on', !isExec);
  if (be) be.classList.toggle('on', isExec);
}

function showMineSub(which) {
  if (which === 'exec') {
    showMineSubUI_('exec');
    loadExecStatus();
  } else {
    initMineTab();
  }
}

// 접수 완료 화면 등에서 바로 실행상 현황으로 이동
function goExecStatus() {
  switchTab('mine', document.querySelectorAll('.nav-btn')[2]);
  showMineSub('exec');
}

function loadExecStatus() {
  var body = document.getElementById('exec-status-body');
  if (body) body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:40px">불러오는 중...</td></tr>';
  apiPost({ action: 'dreamExecGetStatus' }).then(function(res) {
    if (!res || !res.ok) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--rose);padding:40px">' + execEsc_((res && res.error) || '조회 실패 (서버에 실행상 기능이 배포되었는지 확인하세요)') + '</td></tr>';
      return;
    }
    _execStatusItems = res.items || [];
    renderExecStatus();
  }).catch(function(e) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--rose);padding:40px">서버 오류: ' + execEsc_(e.message) + '</td></tr>';
  });
}

function execStateBadge_(s) {
  var map = { '접수완료': '#fbbf24', '심사중': '#a855f7', '심사완료': '#22c55e' };
  return '<span style="background:' + (map[s] || '#94a3b8') + ';color:#fff;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap">' + execEsc_(s || '-') + '</span>';
}

function execProgressBadge_(p) {
  var c = p === '완료' ? '#0f9d58' : '#3b82f6';
  return '<span style="background:' + c + ';color:#fff;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap">' + execEsc_(p === '진행중' ? '진행 중' : p) + '</span>';
}

function renderExecStatus() {
  var body = document.getElementById('exec-status-body');
  if (!body) return;
  var q = ((document.getElementById('exec-st-search') || {}).value || '').toLowerCase().trim();
  var pg = (document.getElementById('exec-st-progress') || {}).value || '';
  var st = (document.getElementById('exec-st-state') || {}).value || '';

  var items = _execStatusItems.filter(function(it) {
    if (pg && it.progress !== pg) return false;
    if (st && it.state !== st) return false;
    if (q) {
      var hay = (it.proposalTitle + ' ' + it.name + ' ' + it.team + ' ' + it.members + ' ' + it.dept).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
  var cnt = document.getElementById('exec-st-cnt');
  if (cnt) cnt.textContent = items.length + ' 건';

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:40px">' + (_execStatusItems.length ? '조건에 맞는 접수가 없습니다.' : '접수된 실행상이 없습니다.') + '</td></tr>';
    return;
  }
  var html = '';
  items.forEach(function(it, i) {
    html += '<tr onclick="toggleExecDetail(' + i + ')" style="cursor:pointer">' +
      '<td style="white-space:nowrap;font-weight:700;color:var(--blue)">' + execEsc_(it.execNo) + '</td>' +
      '<td class="title-main">' + execEsc_(it.proposalNo) + ' · ' + execEsc_(it.proposalTitle) + '</td>' +
      '<td>' + execEsc_(execWho_(it)) + '<div style="font-size:11px;color:#94a3b8">' + execEsc_(it.dept) + '</div></td>' +
      '<td>' + execProgressBadge_(it.progress) + '</td>' +
      '<td style="white-space:nowrap;font-size:12px;color:#64748b">' + execEsc_(it.submittedAt) + '</td>' +
      '<td>' + execStateBadge_(it.state) + '</td>' +
      '<td>' + (it.award ? '<span style="background:#f59e0b;color:#fff;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:800">🏆 ' + execEsc_(it.award) + '</span>' : '<span style="color:#bbb;font-size:12px">—</span>') + '</td>' +
    '</tr>' +
    '<tr id="exec-detail-' + i + '" style="display:none;background:#f8faff"><td colspan="7" style="padding:14px 22px;line-height:1.75;font-size:13px">' +
      '<div><b>추진 기간</b> ' + execEsc_(execPeriodText_(it)) + (it.type === '그룹' && it.members ? ' &nbsp;·&nbsp; <b>구성원</b> ' + execEsc_(it.members) : '') + '</div>' +
      '<div style="margin-top:8px"><b>실행 개요</b><div style="white-space:pre-wrap;margin-top:2px">' + execEsc_(it.summary) + '</div></div>' +
      '<div style="margin-top:8px"><b>주요 성과</b><div style="white-space:pre-wrap;margin-top:2px">' + execEsc_(it.outcome) + '</div></div>' +
    '</td></tr>';
  });
  body.innerHTML = html;
}

function toggleExecDetail(i) {
  var row = document.getElementById('exec-detail-' + i);
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

// ══════════════════════════════════════════════════════════
// ██  심사 탭 — 우수실행상 심사  ██
//   심사위원 로그인(코드)은 기존 제안 심사와 같고, 로그인 후 상단에서 심사 종류를 전환합니다.
// ══════════════════════════════════════════════════════════
var EXEC_LABELS5 = ['매우 크다', '다소 크다', '보통이다', '약간 있다', '없다'];
var EXEC_SCORE_DEF = [
  { key: 'effect', name: '효과성', max: 30,
    desc: ['제안서의 기대효과 대비 실제 성과(예산절감·수입증대 등)는 어떠한가?', '시민·이용자·직원의 만족과 변화는 어떠한가?'],
    options: [30, 24, 18, 12, 6], labels: EXEC_LABELS5 },
  { key: 'efficiency', name: '효율성', max: 30,
    desc: ['인력, 시간, 비용 등의 투입 대비 개선 효과는 어떠한가?', '경영목적을 효율적으로 달성하는 데 얼마나 기여했는가?'],
    options: [30, 24, 18, 12, 6], labels: EXEC_LABELS5 },
  { key: 'sustain', name: '지속가능성', max: 20,
    desc: ['실행 효과가 장기간 이어질 수 있는가?', '계속 운영할 체계(예산·담당·절차)와 타 부서 확산 가능성은 어떠한가?'],
    options: [20, 16, 12, 8, 4], labels: ['제도화·전사 확산', '운영체계 갖춤', '당분간 지속', '한시적 운영', '일회성'] },
  { key: 'fidelity', name: '제안 충실성', max: 10,
    desc: ['제안서 원안대로 이행했는가? 또는 변경 시 사유가 타당한가?', '사업계획서·결과보고서와 증빙자료가 객관적이고 완결성이 있는가?'],
    options: [10, 8, 6, 4, 2], labels: ['매우 충실', '다소 충실', '보통이다', '약간 있다', '없다'] },
  { key: 'effort', name: '노력도', max: 10,
    desc: ['추진 과정의 자발성과 노력 정도는 어떠한가?', '장애요인 극복과 협업은 어떠한가?'],
    options: [10, 8, 6, 4, 2], labels: EXEC_LABELS5 }
];

var _judgeMode = 'proposal';   // 'proposal' | 'exec'
var _xjdItems = [], _xjdIdx = null, _xjdAdvance = false, _xjdLoaded = false;
var _xjdTab = 'text', _xjdFile = -1;

// script.js 의 renderJudgeWork / judgeLogout 에서 호출
function onJudgeLoggedIn_() {
  var bar = document.getElementById('judge-mode-bar');
  if (bar) bar.style.display = '';
  // 실행상 모드에서 제안 심사 화면이 다시 그려져도 실행상 화면 유지
  if (_judgeMode === 'exec') {
    var w = document.getElementById('judge-work'); if (w) w.style.display = 'none';
  }
}
function onJudgeLoggedOut_() {
  var bar = document.getElementById('judge-mode-bar');
  if (bar) bar.style.display = 'none';
  var we = document.getElementById('judge-work-exec');
  if (we) we.style.display = 'none';
  _judgeMode = 'proposal';
  _xjdItems = []; _xjdIdx = null; _xjdLoaded = false; _xjdTab = 'text'; _xjdFile = -1;
  var bp = document.getElementById('judge-mode-proposal'), be = document.getElementById('judge-mode-exec');
  if (bp) bp.classList.add('on');
  if (be) be.classList.remove('on');
}

function setJudgeMode(mode) {
  if (!_judgeCode) return;
  _judgeMode = mode === 'exec' ? 'exec' : 'proposal';
  var isExec = _judgeMode === 'exec';
  var w = document.getElementById('judge-work'), we = document.getElementById('judge-work-exec');
  if (w) w.style.display = isExec ? 'none' : 'block';
  if (we) we.style.display = isExec ? 'block' : 'none';
  var bp = document.getElementById('judge-mode-proposal'), be = document.getElementById('judge-mode-exec');
  if (bp) bp.classList.toggle('on', !isExec);
  if (be) be.classList.toggle('on', isExec);
  if (isExec && !_xjdLoaded) loadXjdItems();
}

function loadXjdItems() {
  showLoadingOverlay('실행상 접수 목록 로드 중...');
  apiPost({ action: 'dreamExecGetJudgeItems', code: _judgeCode }).then(function(res) {
    hideLoadingOverlay();
    if (!res || !res.ok) {
      alert('목록 로드 실패: ' + ((res && res.error) || '서버에 실행상 기능이 아직 배포되지 않았을 수 있습니다.'));
      return;
    }
    _xjdItems = res.items || [];
    _xjdLoaded = true;
    if (_xjdAdvance) {
      _xjdAdvance = false;
      var nx = _xjdItems.length ? xjdNextIdx_(_xjdIdx === null ? -1 : _xjdIdx) : -1;
      if (nx >= 0) _xjdIdx = nx;
    }
    renderXjdWork();
  }).catch(function(e) {
    hideLoadingOverlay();
    alert('서버 오류: ' + e.message);
  });
}

function xjdSaved_(it) { return it.myStatus === '임시저장' || it.myStatus === '제출완료'; }

function xjdNextIdx_(from) {
  var n = _xjdItems.length;
  for (var k = 1; k <= n; k++) {
    var i = (from + k) % n;
    if (!xjdSaved_(_xjdItems[i])) return i;
  }
  return -1;
}

function renderXjdWork() {
  document.getElementById('xjd-name').textContent = (_judgeInfo && _judgeInfo.name) || '';
  var saved = _xjdItems.filter(xjdSaved_);
  var allFinal = _xjdItems.length > 0 && _xjdItems.every(function(it) { return it.myStatus === '제출완료'; });
  var allSaved = _xjdItems.length > 0 && saved.length === _xjdItems.length;
  document.getElementById('xjd-done-cnt').textContent = saved.length;
  document.getElementById('xjd-total-cnt').textContent = _xjdItems.length;
  var avgEl = document.getElementById('xjd-avg');
  if (saved.length) {
    var sum = saved.reduce(function(s, it) { return s + (Number(it.myTotal) || 0); }, 0);
    avgEl.textContent = (Math.round((sum / saved.length) * 10) / 10) + '점';
  } else avgEl.textContent = '—';

  var fin = document.getElementById('xjd-finalize-btn');
  if (fin) {
    if (allFinal) { fin.textContent = '✅ 심사 완료됨'; fin.disabled = true; fin.style.background = '#94a3b8'; fin.style.cursor = 'default'; }
    else if (allSaved) { fin.textContent = '🏁 최종 심사 완료'; fin.disabled = false; fin.style.background = '#0f9d58'; fin.style.cursor = 'pointer'; }
    else { fin.textContent = '🏁 최종 심사 완료'; fin.disabled = true; fin.style.background = '#cbd5e1'; fin.style.cursor = 'not-allowed'; }
  }

  if (!_xjdItems.length) {
    document.getElementById('xjd-nav-chips').innerHTML = '';
    document.getElementById('xjd-pos').textContent = '';
    document.getElementById('xjd-view').innerHTML = '<p class="mine-empty">심사 대상(실행상 접수)이 없습니다.</p>';
    document.getElementById('xjd-score-area').innerHTML = '<p class="mine-empty">접수 건을 선택하세요.</p>';
    return;
  }

  var chips = '';
  _xjdItems.forEach(function(it, idx) {
    var cls = it.myStatus === '제출완료' ? 'completed' : it.myStatus === '임시저장' ? 'draft' : 'pending';
    var tip = it.execNo + ' · ' + it.proposalTitle + (cls === 'pending' ? ' (미채점)' : ' (' + (it.myTotal || 0) + '점)');
    chips += '<button type="button" class="tjd-chip ' + cls + '" data-xjd-idx="' + idx + '" title="' + execEsc_(tip) + '" onclick="selectXjd(' + idx + ')">' + (idx + 1) + '</button>';
  });
  document.getElementById('xjd-nav-chips').innerHTML = chips;

  if (_xjdIdx === null || !_xjdItems[_xjdIdx]) {
    var first = xjdNextIdx_(-1);
    _xjdIdx = first >= 0 ? first : 0;
  }
  selectXjd(_xjdIdx);
}

function selectXjd(idx) {
  if (!_xjdItems[idx]) return;
  _xjdIdx = idx;
  _xjdFile = -1;
  document.querySelectorAll('#xjd-nav-chips .tjd-chip').forEach(function(c) {
    var on = Number(c.getAttribute('data-xjd-idx')) === idx;
    c.classList.toggle('active', on);
    if (on && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  var pos = document.getElementById('xjd-pos');
  if (pos) pos.textContent = (idx + 1) + ' / ' + _xjdItems.length;
  renderXjdView(idx);
  renderXjdScore(idx);
  var l = document.querySelector('#judge-work-exec .tjd-view-body'); if (l) l.scrollTop = 0;
  var r = document.querySelector('#judge-work-exec .tjd-right'); if (r) r.scrollTop = 0;
}

function xjdStep(delta) {
  if (_xjdIdx === null) return;
  var n = _xjdIdx + delta;
  if (n < 0 || n >= _xjdItems.length) return;
  selectXjd(n);
}

function xjdNextUnscored() {
  var i = xjdNextIdx_(_xjdIdx === null ? -1 : _xjdIdx);
  if (i < 0) return showToast('모든 접수 건이 채점·저장되었습니다.', 'ok');
  selectXjd(i);
}

function setXjdTab(tab) {
  _xjdTab = tab;
  _xjdFile = -1;
  if (_xjdIdx !== null) renderXjdView(_xjdIdx);
}

function pickXjdFile(i) {
  _xjdFile = i;
  if (_xjdIdx !== null) renderXjdView(_xjdIdx);
}

function renderXjdView(idx) {
  var it = _xjdItems[idx];
  var led = execFindLedger_(it.proposalNo);
  var origUrl = led && led.pdf ? encodeURI(led.pdf) : '';
  if (_xjdTab === 'orig' && !origUrl) _xjdTab = 'text';

  var html = '<div class="tjd-view-head"><span class="rv-proposal-no">' + execEsc_(it.execNo) + '</span>' +
    '<span class="tjd-view-title">' + execEsc_(it.proposalTitle) + '</span></div>';

  var nFiles = (it.files || []).length;
  html += '<div class="tjd-tabs">' +
    '<button type="button" class="tjd-tab' + (_xjdTab === 'text' ? ' on' : '') + '" onclick="setXjdTab(\'text\')">📝 실행 내용</button>' +
    '<button type="button" class="tjd-tab' + (_xjdTab === 'files' ? ' on' : '') + '" onclick="setXjdTab(\'files\')">📎 증빙자료 (' + nFiles + ')</button>' +
    (origUrl ? '<button type="button" class="tjd-tab' + (_xjdTab === 'orig' ? ' on' : '') + '" onclick="setXjdTab(\'orig\')">📄 제안서 원본</button>' : '') +
    (origUrl && _xjdTab === 'orig' ? '<a class="tjd-newwin" href="' + execEsc_(origUrl) + '" target="_blank" rel="noopener">↗ 새 창에서 크게 보기</a>' : '') +
    '</div>';

  if (_xjdTab === 'orig' && origUrl) {
    // #view=FitH : 가로 폭에 맞춰 크게 표시
    html += '<div class="tjd-view-body pdf"><iframe src="' + execEsc_(origUrl) + '#view=FitH"></iframe></div>';
  } else if (_xjdTab === 'files') {
    html += '<div class="tjd-view-body">';
    if (!nFiles && !it.link) html += '<p class="mine-empty">제출된 증빙자료가 없습니다.</p>';
    if (nFiles) html += '<div class="lbl-hint" style="margin:0 0 8px">파일명을 누르면 아래에 미리보기가 표시됩니다.</div>';
    (it.files || []).forEach(function(f, i) {
      html += '<div class="xjd-file' + (i === _xjdFile ? ' on' : '') + '">' +
        '<button type="button" class="xjd-file-btn" onclick="pickXjdFile(' + i + ')">📄 ' + execEsc_(f.name) + '</button>' +
        '<a class="xjd-file-open" href="' + execEsc_(f.url) + '" target="_blank" rel="noopener">↗ 새 창</a></div>';
    });
    if (it.link) html += '<div class="xjd-file"><span class="xjd-file-btn" style="cursor:default">🔗 증빙 링크</span><a class="xjd-file-open" href="' + execEsc_(it.link) + '" target="_blank" rel="noopener">↗ 열기</a></div>';
    if (_xjdFile >= 0 && it.files[_xjdFile]) {
      var fid = execDriveId_(it.files[_xjdFile].url);
      if (fid) html += '<div class="xjd-preview"><iframe src="https://drive.google.com/file/d/' + fid + '/preview" allow="autoplay"></iframe></div>' +
        '<div class="lbl-hint" style="margin-top:6px">※ 한글(HWP) 등 일부 형식은 미리보기가 안 될 수 있습니다. 그때는 [↗ 새 창]으로 내려받아 확인하세요.</div>';
    }
    html += '</div>';
  } else {
    html += '<div class="tjd-view-body">' +
      '<div class="rv-pb-row"><div class="rv-pb-label">대상 제안</div><div class="rv-pb-text">' + execEsc_(it.proposalNo) + ' · ' + execEsc_(it.proposalTitle) + '</div></div>' +
      '<div class="rv-pb-row"><div class="rv-pb-label">제안실행자(팀)</div><div class="rv-pb-text">' + execEsc_(it.type) + ' · ' + execEsc_(execWho_(it)) + ' · ' + execEsc_(it.dept) +
        (it.type === '그룹' && it.members ? '<br>구성원: ' + execEsc_(it.members) : '') + '</div></div>' +
      '<div class="rv-pb-row"><div class="rv-pb-label">추진 상태 · 기간</div><div class="rv-pb-text">' + execEsc_(it.progress === '진행중' ? '진행 중' : it.progress) + ' · ' + execEsc_(execPeriodText_(it)) + '</div></div>' +
      '<div class="rv-pb-row"><div class="rv-pb-label">실행 개요</div><div class="rv-pb-text" style="white-space:pre-wrap">' + execEsc_(it.summary) + '</div></div>' +
      '<div class="rv-pb-row"><div class="rv-pb-label">주요 성과</div><div class="rv-pb-text" style="white-space:pre-wrap">' + execEsc_(it.outcome) + '</div></div>' +
      '</div>';
  }
  document.getElementById('xjd-view').innerHTML = html;
}

function renderXjdScore(idx) {
  var it = _xjdItems[idx];
  var locked = it.myStatus === '제출완료';
  var my = it.myScores || {};

  var html = '<div class="rv-opinion-receipt">접수번호 <b>' + execEsc_(it.execNo) + '</b>' +
    (it.myStatus === '임시저장' ? ' <span class="tjd-saved-tag">저장됨 · 수정 후 다시 저장 가능</span>' : '') + '</div>';

  html += '<table class="tjd-score-table xjd-score-table"><tbody>';
  EXEC_SCORE_DEF.forEach(function(def) {
    html += '<tr><th>' + def.name + '<span class="max">(' + def.max + '점)</span>' +
      '<div class="xjd-desc">' + def.desc.map(function(d) { return '❍ ' + d; }).join('<br>') + '</div></th>';
    def.options.forEach(function(v, i) {
      var on = my[def.key] === v;
      html += '<td><label class="' + (on ? 'checked' : '') + '">' +
        '<input type="radio" name="xjd-' + def.key + '" value="' + v + '"' + (on ? ' checked' : '') + (locked ? ' disabled' : '') + ' onchange="onXjdScoreChange(\'' + def.key + '\')">' +
        '<span class="tjd-score-points">' + v + '</span><span class="tjd-score-label">' + def.labels[i] + '</span></label></td>';
    });
    html += '</tr>';
  });
  html += '<tr class="total-row"><th>합 계</th><td colspan="5"><span id="xjd-total">0</span> / 100점</td></tr></tbody></table>';

  html += '<div class="sf-field full" style="margin-bottom:0"><label>심사의견 <span class="lbl-hint">(선택)</span></label>' +
    '<textarea id="xjd-opinion-input" rows="3"' + (locked ? ' readonly' : '') + ' placeholder="심사 결과에 대한 의견을 자유롭게 작성하세요" style="width:100%;border:1.5px solid #d5dbe8;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:13px;line-height:1.6;background:#fafbfd;resize:vertical;box-sizing:border-box">' + execEsc_(it.myOpinion || '') + '</textarea></div>';

  if (locked) {
    html += '<div class="rv-locked-notice done" style="margin-top:14px">✅ 최종 심사 완료 상태입니다. 수정이 필요하면 관리자에게 문의하세요.</div>';
  } else {
    html += '<div class="rv-opinion-btns" style="margin-top:14px"><button class="rv-btn-submit" onclick="saveXjdScore()">💾 저장 후 다음 접수 건</button></div>';
  }
  document.getElementById('xjd-score-area').innerHTML = html;
  updateXjdTotal();
}

function onXjdScoreChange(key) {
  document.querySelectorAll('input[name="xjd-' + key + '"]').forEach(function(input) {
    if (input.parentElement) input.parentElement.classList.toggle('checked', input.checked);
  });
  updateXjdTotal();
}

function updateXjdTotal() {
  var total = 0;
  EXEC_SCORE_DEF.forEach(function(def) {
    var c = document.querySelector('input[name="xjd-' + def.key + '"]:checked');
    if (c) total += parseInt(c.value, 10) || 0;
  });
  var el = document.getElementById('xjd-total');
  if (el) el.textContent = total;
}

function saveXjdScore() {
  if (_xjdIdx === null || !_xjdItems[_xjdIdx]) return alert('접수 건을 선택하세요.');
  var scores = {}, total = 0, filled = true;
  EXEC_SCORE_DEF.forEach(function(def) {
    var c = document.querySelector('input[name="xjd-' + def.key + '"]:checked');
    if (!c) { filled = false; scores[def.key] = 0; }
    else { scores[def.key] = parseInt(c.value, 10) || 0; total += scores[def.key]; }
  });
  if (!filled) return alert('5개 항목 모두 채점해주세요.');
  var opinion = (document.getElementById('xjd-opinion-input').value || '').trim();

  showLoadingOverlay('저장 중...');
  apiPost({
    action: 'dreamExecSaveScore', code: _judgeCode,
    execNo: _xjdItems[_xjdIdx].execNo, scores: scores, total: total, opinion: opinion
  }).then(function(res) {
    hideLoadingOverlay();
    if (!res || !res.ok) { alert('저장 실패: ' + ((res && res.error) || '')); return; }
    showToast('✅ ' + total + '점 저장됨', 'ok');
    _xjdAdvance = true;
    loadXjdItems();
  }).catch(function(e) {
    hideLoadingOverlay();
    alert('서버 오류: ' + e.message);
  });
}

function finalizeXjd() {
  var saved = _xjdItems.filter(xjdSaved_);
  if (!saved.length) return alert('저장된 점수가 없습니다.');
  if (saved.length < _xjdItems.length) return alert('모든 접수 건의 채점이 끝나야 최종 제출할 수 있습니다.\n저장 ' + saved.length + ' / ' + _xjdItems.length);
  if (!confirm('실행상 심사 점수를 최종 제출합니다.\n이후에는 수정이 불가능합니다.\n\n진행하시겠습니까?')) return;
  showLoadingOverlay('최종 제출 중...');
  apiPost({ action: 'dreamExecFinalizeJudge', code: _judgeCode }).then(function(res) {
    hideLoadingOverlay();
    if (!res || !res.ok) { alert('제출 실패: ' + ((res && res.error) || '')); return; }
    showToast('✅ 실행상 심사가 최종 완료되었습니다.', 'ok');
    loadXjdItems();
  }).catch(function(e) {
    hideLoadingOverlay();
    alert('서버 오류: ' + e.message);
  });
}

// ══════════════════════════════════════════════════════════
// ██  관리자 — 실행상 접수·심사 순위·우수 선정  ██
// ══════════════════════════════════════════════════════════
var _mgExecItems = [], _mgExecMax = 3, _mgExecLoaded = false;

function loadMgExec(force) {
  if (!isAdmin || !ADMIN_PW) return;
  var body = document.getElementById('mgExecBody');
  if (!body) return;
  if (_mgExecLoaded && !force) { renderMgExec(); return; }
  body.innerHTML = '<p style="text-align:center;color:#aaa;padding:20px">불러오는 중...</p>';
  apiPost({ action: 'dreamExecGetAdminList', pw: ADMIN_PW }).then(function(res) {
    if (!res || !res.ok) {
      body.innerHTML = '<p style="text-align:center;color:var(--rose);padding:20px;font-size:13px">' + execEsc_((res && res.error) || '조회 실패 (서버에 실행상 기능이 배포되었는지 확인하세요)') + '</p>';
      return;
    }
    _mgExecItems = res.items || [];
    _mgExecMax = res.maxAwards || 3;
    _mgExecLoaded = true;
    renderMgExec();
  }).catch(function(e) {
    body.innerHTML = '<p style="text-align:center;color:var(--rose);padding:20px;font-size:13px">서버 오류: ' + execEsc_(e.message) + '</p>';
  });
}

function renderMgExec() {
  var body = document.getElementById('mgExecBody');
  if (!body) return;
  if (!_mgExecItems.length) { body.innerHTML = '<p style="text-align:center;color:#aaa;padding:20px;font-size:13px">접수된 실행상이 없습니다.</p>'; return; }
  var awarded = _mgExecItems.filter(function(it) { return it.award; }).length;
  var html = '<div style="margin-bottom:10px;font-size:13px;color:var(--navy);font-weight:700">우수 제안실행 선정 ' + awarded + ' / ' + _mgExecMax + '건 · 접수 ' + _mgExecItems.length + '건</div>' +
    '<div class="tbl-wrap"><table class="submit-list-table"><thead><tr>' +
    '<th>순위</th><th>접수번호</th><th>대상 제안</th><th>제안실행자(팀)</th><th>추진</th><th>채점</th><th>평균</th><th>증빙</th><th>선정</th>' +
    '</tr></thead><tbody>';
  _mgExecItems.forEach(function(it, i) {
    var nf = (it.files || []).length;
    html += '<tr style="cursor:pointer" onclick="toggleMgExecDetail(' + i + ')">' +
      '<td style="font-weight:800;color:var(--blue)">' + (it.rank ? it.rank : '—') + '</td>' +
      '<td style="white-space:nowrap;font-weight:700">' + execEsc_(it.execNo) + '</td>' +
      '<td>' + execEsc_(it.proposalNo) + ' · ' + execEsc_(it.proposalTitle) + '</td>' +
      '<td>' + execEsc_(execWho_(it)) + '<div style="font-size:11px;color:#94a3b8">' + execEsc_(it.dept) + '</div></td>' +
      '<td>' + execProgressBadge_(it.progress) + '</td>' +
      '<td style="white-space:nowrap">' + it.judgeCount + '명<div style="font-size:11px;color:#94a3b8">최종 ' + it.finalCount + '명</div></td>' +
      '<td style="font-weight:800">' + (it.judgeCount ? it.avg + '점' : '—') + '</td>' +
      '<td style="white-space:nowrap">' + (it.folder ? '<a href="' + execEsc_(it.folder) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">📁 ' + nf + '개</a>' : nf + '개') + '</td>' +
      '<td onclick="event.stopPropagation()">' +
        (it.award
          ? '<button class="btn-cancel" style="padding:4px 10px;font-size:12px;border-color:#f59e0b;color:#b45309" onclick="setMgExecAward(\'' + execEsc_(it.execNo) + '\',\'\')">🏆 선정 해제</button>'
          : '<button class="rv-btn-submit" style="padding:5px 12px;font-size:12px" onclick="setMgExecAward(\'' + execEsc_(it.execNo) + '\',\'우수실행\')">우수 선정</button>') +
      '</td></tr>' +
      '<tr id="mgexec-detail-' + i + '" style="display:none;background:#f8faff"><td colspan="9" style="padding:14px 22px;line-height:1.75;font-size:13px">' +
        '<div><b>추진</b> ' + execEsc_(it.progress === '진행중' ? '진행 중' : it.progress) + ' · ' + execEsc_(execPeriodText_(it)) + (it.type === '그룹' && it.members ? ' · <b>구성원</b> ' + execEsc_(it.members) : '') + ' · <b>접수일</b> ' + execEsc_(it.submittedAt) + '</div>' +
        '<div style="margin-top:8px"><b>실행 개요</b><div style="white-space:pre-wrap">' + execEsc_(it.summary) + '</div></div>' +
        '<div style="margin-top:8px"><b>주요 성과</b><div style="white-space:pre-wrap">' + execEsc_(it.outcome) + '</div></div>' +
        '<div style="margin-top:8px"><b>증빙자료</b> ' +
          ((it.files || []).map(function(f) { return '<a href="' + execEsc_(f.url) + '" target="_blank" rel="noopener">📄 ' + execEsc_(f.name) + '</a>'; }).join(' &nbsp; ') || '없음') +
          (it.link ? ' &nbsp; <a href="' + execEsc_(it.link) + '" target="_blank" rel="noopener">🔗 증빙 링크</a>' : '') + '</div>' +
        ((it.judges && it.judges.length) ? '<div style="margin-top:8px"><b>심사위원별 점수</b> ' + it.judges.map(function(j) {
          return execEsc_(j.judge) + ' ' + j.total + '점' + (j.status === '제출완료' ? '' : '(임시)');
        }).join(' / ') + '</div>' : '') +
      '</td></tr>';
  });
  html += '</tbody></table></div>';
  body.innerHTML = html;
}

function toggleMgExecDetail(i) {
  var row = document.getElementById('mgexec-detail-' + i);
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

function setMgExecAward(execNo, award) {
  var msg = award ? '"' + execNo + '"을(를) 우수 제안실행으로 선정합니다.\n선정 결과는 [접수 확인] 화면에 공개됩니다.\n\n진행하시겠습니까?' : '"' + execNo + '"의 우수 선정을 해제합니다.\n\n진행하시겠습니까?';
  if (!confirm(msg)) return;
  showLoadingOverlay('처리 중...');
  apiPost({ action: 'dreamExecSetResult', pw: ADMIN_PW, execNo: execNo, award: award }).then(function(res) {
    hideLoadingOverlay();
    if (!res || !res.ok) { alert('처리 실패: ' + ((res && res.error) || '')); return; }
    showToast(award ? '🏆 우수 제안실행으로 선정했습니다.' : '선정을 해제했습니다.', 'ok');
    loadMgExec(true);
  }).catch(function(e) {
    hideLoadingOverlay();
    alert('서버 오류: ' + e.message);
  });
}
