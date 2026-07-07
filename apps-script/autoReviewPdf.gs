/**
 * 혁신드림제안 - 통합 PDF(제안서+검토의견) 자동 저장
 *
 * [동작 방식]
 *   마지막 담당부서가 검토를 '완료'하는 순간 (review.gs의 dreamUpdateProposalStatus_에서 호출)
 *   서버에서 통합 PDF 2종을 자동 생성해 Drive의 02_검토의견 폴더에 저장합니다.
 *     - {접수번호}_검토의견_원본.pdf : 제안자 성명/소속/구성원 표시
 *     - {접수번호}_검토의견_익명.pdf : 제안자 정보 비공개 처리
 *
 *   ※ 서버 생성 버전이라 첨부자료 병합은 되지 않습니다.
 *     (첨부는 01_제안서원본 폴더에 이미 저장되어 있음)
 *     첨부까지 합쳐진 버전이 필요하면 관리자 화면의 [☁️ Drive에 저장] 버튼을 사용하세요.
 *     버튼으로 저장하면 같은 파일명이라 자동 저장본을 덮어씁니다.
 *
 * [의존성 — 같은 프로젝트에 있어야 하는 것]
 *   - DREAM_SHEET_ID, dreamGetOrCreateFolder_, DREAM_DRIVE_ROOT_NAME (setup.gs)
 *   - dreamGetReviewFolderForReceipt_, dreamTrashFilesByName_ (saveReviewPdfs.gs)
 *   - dreamFmtDate_ (getMyProposal.gs)
 *
 * [기존 데이터 소급 적용]
 *   이미 검토가 끝난 제안들은 편집기에서 dreamBackfillReviewPdfs()를 한 번 실행하세요.
 *
 * [doPost 수정 불필요]
 *   서버 내부에서만 호출되므로 Code.gs doPost에 추가할 것이 없습니다.
 */

/**
 * 접수번호 하나에 대해 통합 PDF 2종(원본/익명)을 생성해 02_검토의견 폴더에 저장
 * 기존 같은 이름 파일은 휴지통으로 보내고 교체합니다.
 */
function dreamAutoSaveReviewPdfs(receiptNo) {
  receiptNo = String(receiptNo || '').trim();
  if (!receiptNo) throw new Error('receiptNo가 비어있습니다.');

  var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);

  // 제안 정보 읽기
  var pSheet = ss.getSheetByName('제안');
  if (!pSheet || pSheet.getLastRow() < 2) throw new Error('제안 시트에 데이터가 없습니다.');
  var pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 15).getValues();
  var p = null;
  for (var i = 0; i < pRows.length; i++) {
    if (String(pRows[i][0]) === receiptNo) { p = pRows[i]; break; }
  }
  if (!p) throw new Error('접수번호를 찾을 수 없습니다: ' + receiptNo);

  var proposal = {
    receiptNo:   receiptNo,
    name:        String(p[1] || ''),
    dept:        String(p[2] || ''),
    submittedAt: dreamFmtDate_(p[3]),
    category:    String(p[4] || ''),
    targetDepts: String(p[5] || '').split(',').map(function(s){return s.trim();}).filter(Boolean),
    title:       String(p[6] || ''),
    reason:      String(p[7] || ''),
    method:      String(p[8] || ''),
    effect:      String(p[9] || ''),
    members:     String(p[14] || '').split(',').map(function(s){return s.trim();}).filter(Boolean)
  };

  // 검토 의견 읽기 (해당 접수번호 전체)
  var reviews = [];
  var rSheet = ss.getSheetByName('검토');
  if (rSheet && rSheet.getLastRow() > 1) {
    var rRows = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 8).getValues();
    rRows.forEach(function(r) {
      if (String(r[1]) !== receiptNo) return;
      reviews.push({
        dept:     String(r[2] || ''),
        reviewer: String(r[3] || ''),
        date:     dreamFmtDate_(r[4]),
        opinion:  String(r[5] || ''),
        status:   String(r[6] || '')
      });
    });
  }

  // PDF 2종 생성
  var origName = receiptNo + '_검토의견_원본.pdf';
  var anonName = receiptNo + '_검토의견_익명.pdf';
  var origBlob = dreamHtmlToPdfBlob_(dreamBuildReviewPdfHtml_(proposal, reviews, false), origName);
  var anonBlob = dreamHtmlToPdfBlob_(dreamBuildReviewPdfHtml_(proposal, reviews, true), anonName);

  // Drive 저장 (기존 파일 교체)
  var reviewFolder = dreamGetReviewFolderForReceipt_(receiptNo);
  dreamTrashFilesByName_(reviewFolder, origName);
  dreamTrashFilesByName_(reviewFolder, anonName);
  var origFile = reviewFolder.createFile(origBlob);
  reviewFolder.createFile(anonBlob);

  // '검토' 시트 PDF링크(H열) 채움
  if (rSheet && rSheet.getLastRow() > 1) {
    var receipts = rSheet.getRange(2, 2, rSheet.getLastRow() - 1, 1).getValues();
    for (var j = 0; j < receipts.length; j++) {
      if (String(receipts[j][0]) === receiptNo) {
        rSheet.getRange(j + 2, 8).setValue(origFile.getUrl());
      }
    }
  }

  Logger.log('✅ 통합 PDF 자동 저장 완료: ' + receiptNo);
  return { ok: true };
}

// HTML → PDF 변환
function dreamHtmlToPdfBlob_(html, filename) {
  return Utilities.newBlob(html, 'text/html', filename.replace(/\.pdf$/, '.html'))
    .getAs('application/pdf')
    .setName(filename);
}

/**
 * 통합 PDF용 HTML 생성 (세로 A4, 표 기반 — Apps Script 변환기 호환 레이아웃)
 * @param {boolean} anonymize - true면 성명/소속 '비공개', 구성원 숨김
 */
function dreamBuildReviewPdfHtml_(d, reviews, anonymize) {
  var esc = function(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  var nl2br = function(s) { return esc(s).replace(/\n/g, '<br>'); };

  var name = anonymize ? '비공개' : d.name;
  var dept = anonymize ? '비공개' : d.dept;

  var thStyle = 'background:#eef3ff;border:1px solid #d5dbe8;padding:5px 9px;font-weight:bold;width:90px;font-size:11px';
  var tdStyle = 'border:1px solid #d5dbe8;padding:5px 9px;font-size:11px';
  var secStyle = 'background:#f6f8fd;border-left:4px solid #204473;padding:5px 10px;font-weight:bold;font-size:12px;margin:14px 0 6px 0';
  var bodyStyle = 'padding:2px 8px 6px 8px;font-size:11px;line-height:1.6';

  var html = '<html><head><meta charset="utf-8"><style>'
    + 'body { font-family: "Malgun Gothic", sans-serif; color:#1a2035; margin:0; padding:8px; }'
    + 'table { border-collapse: collapse; width:100%; }'
    + '</style></head><body>';

  // 제목
  html += '<div style="text-align:center;font-size:20px;font-weight:bold;border-bottom:3px double #204473;padding-bottom:8px;margin-bottom:14px">혁신드림제안서 · 검토의견</div>';

  // 제안 정보 표
  html += '<table>'
    + '<tr><td style="' + thStyle + '">접수번호</td><td style="' + tdStyle + ';font-weight:bold;color:#204473">' + esc(d.receiptNo) + '</td>'
    +     '<td style="' + thStyle + '">접수일</td><td style="' + tdStyle + '">' + esc((d.submittedAt || '').substring(0, 16)) + '</td></tr>'
    + '<tr><td style="' + thStyle + '">제안부문</td><td style="' + tdStyle + '" colspan="3">' + esc(d.category) + '</td></tr>'
    + '<tr><td style="' + thStyle + '">성명</td><td style="' + tdStyle + '">' + esc(name) + '</td>'
    +     '<td style="' + thStyle + '">소속</td><td style="' + tdStyle + '">' + esc(dept) + '</td></tr>'
    + (!anonymize && d.members.length > 0
        ? '<tr><td style="' + thStyle + '">구성원</td><td style="' + tdStyle + '" colspan="3">' + esc(d.members.join(', ')) + '</td></tr>'
        : '')
    + '<tr><td style="' + thStyle + '">담당부서</td><td style="' + tdStyle + '" colspan="3">' + esc(d.targetDepts.join(', ')) + '</td></tr>'
    + '<tr><td style="' + thStyle + '">제목</td><td style="' + tdStyle + ';font-weight:bold" colspan="3">' + esc(d.title) + '</td></tr>'
    + '</table>';

  // 제안 내용
  html += '<div style="' + secStyle + '">제안사유 (원인분석)</div><div style="' + bodyStyle + '">' + nl2br(d.reason) + '</div>';
  html += '<div style="' + secStyle + '">실시방법 (개선방향)</div><div style="' + bodyStyle + '">' + nl2br(d.method) + '</div>';
  if (d.effect) {
    html += '<div style="' + secStyle + '">기대효과</div><div style="' + bodyStyle + '">' + nl2br(d.effect) + '</div>';
  }

  // 검토의견 (담당부서 순서대로, 의견 없는 부서도 표시)
  html += '<div style="text-align:center;font-size:16px;font-weight:bold;border-bottom:2px double #204473;padding-bottom:6px;margin:22px 0 12px 0">담당부서 검토의견</div>';
  if (d.targetDepts.length === 0) {
    html += '<div style="text-align:center;color:#999;font-size:11px;padding:20px 0">담당부서가 지정되지 않았습니다.</div>';
  }
  d.targetDepts.forEach(function(deptName) {
    var rv = null;
    for (var i = 0; i < reviews.length; i++) {
      if (reviews[i].dept === deptName) { rv = reviews[i]; break; }
    }
    var statusLabel = !rv ? '검토 대기' : (rv.status === '완료' ? '검토 완료' : '작성 중');
    html += '<table style="margin-bottom:10px">'
      + '<tr><td style="background:#f0f3f9;border:1px solid #d5dbe8;padding:5px 9px;font-size:11px">'
      +   '<b style="color:#204473">' + esc(deptName) + '</b>'
      +   ' &nbsp;·&nbsp; ' + esc(statusLabel)
      +   (rv && rv.date ? ' &nbsp;·&nbsp; ' + esc(rv.date) : '')
      + '</td></tr>'
      + '<tr><td style="border:1px solid #d5dbe8;padding:8px 10px;font-size:11px;line-height:1.6">'
      +   ((rv && rv.opinion) ? nl2br(rv.opinion) : '<span style="color:#999;font-style:italic">아직 검토의견이 작성되지 않았습니다.</span>')
      + '</td></tr>'
      + '</table>';
  });

  html += '</body></html>';
  return html;
}

/**
 * [소급 적용용] 검토가 모두 완료된 제안 중 02_검토의견에 PDF가 없는 것을 일괄 생성
 * Apps Script 편집기에서 직접 실행하세요.
 */
function dreamBackfillReviewPdfs() {
  var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
  var pSheet = ss.getSheetByName('제안');
  if (!pSheet || pSheet.getLastRow() < 2) { Logger.log('제안 데이터 없음'); return; }
  var pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 15).getValues();

  // 접수번호별 완료된 검토 부서 목록
  var doneByReceipt = {};
  var rSheet = ss.getSheetByName('검토');
  if (rSheet && rSheet.getLastRow() > 1) {
    var rRows = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 8).getValues();
    rRows.forEach(function(r) {
      if (String(r[6]) !== '완료') return;
      var key = String(r[1]);
      if (!doneByReceipt[key]) doneByReceipt[key] = [];
      doneByReceipt[key].push(String(r[2]));
    });
  }

  var created = 0, skipped = 0;
  pRows.forEach(function(p) {
    var receiptNo = String(p[0]);
    var targetDepts = String(p[5] || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
    var doneDepts = doneByReceipt[receiptNo] || [];
    var allDone = targetDepts.length > 0 && targetDepts.every(function(dp) { return doneDepts.indexOf(dp) >= 0; });
    if (!allDone) { skipped++; return; }

    // 이미 PDF가 있으면 건너뜀 (강제 재생성하려면 아래 if 블록을 주석 처리)
    var folder = dreamGetReviewFolderForReceipt_(receiptNo);
    if (folder.getFilesByName(receiptNo + '_검토의견_원본.pdf').hasNext()) { skipped++; return; }

    try {
      dreamAutoSaveReviewPdfs(receiptNo);
      created++;
    } catch (e) {
      Logger.log('❌ ' + receiptNo + ' 실패: ' + e);
    }
  });

  Logger.log('완료 — 생성: ' + created + '건, 건너뜀: ' + skipped + '건');
}
