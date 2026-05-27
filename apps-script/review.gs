/**
 * 혁신드림제안 - 검토위원 시스템
 *
 * [기능]
 *   1) dreamReviewLogin: 코드 검증 + 위원 정보 반환
 *   2) dreamGetReviewItems: 본인 부서가 담당으로 지정된 제안 목록 + 본인 검토 상태
 *      (본인이 완료한 경우에만 다른 부서 의견을 함께 반환 — 잠금 로직)
 *   3) dreamSaveReview: 검토 의견 저장 (작성중 or 완료)
 *      (완료 상태인 검토는 수정 불가)
 *
 * [Code.gs doPost switch에 추가할 3줄]
 *   case 'dreamReviewLogin':      result = dreamReviewLogin(d); break;
 *   case 'dreamGetReviewItems':   result = dreamGetReviewItems(d); break;
 *   case 'dreamSaveReview':       result = dreamSaveReview(d); break;
 */

// ── 위원 코드로 위원 정보 조회 ───────────────────────
function dreamFindReviewer_(code) {
  var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
  var sheet = ss.getSheetByName('위원');
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var target = String(code || '').trim().toUpperCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][3] || '').trim().toUpperCase() === target) {
      return {
        role: String(rows[i][0] || ''),
        name: String(rows[i][1] || ''),
        dept: String(rows[i][2] || '')
      };
    }
  }
  return null;
}

// ── 검토위원 로그인 ──────────────────────────────────
function dreamReviewLogin(data) {
  try {
    if (!data || !data.code) throw new Error('코드를 입력해주세요.');
    var info = dreamFindReviewer_(data.code);
    if (!info) return { ok: false, error: '유효하지 않은 코드입니다.' };
    if (info.role !== '검토위원') return { ok: false, error: '검토위원 코드가 아닙니다.' };
    return { ok: true, reviewer: { name: info.name, dept: info.dept } };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ── 검토 대상 제안 목록 + 본인 검토 상태 ─────────────
function dreamGetReviewItems(data) {
  try {
    if (!data || !data.code) throw new Error('코드 누락');
    var info = dreamFindReviewer_(data.code);
    if (!info || info.role !== '검토위원') return { ok: false, error: '권한 없음' };

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var pSheet = ss.getSheetByName('제안');
    if (!pSheet) throw new Error('제안 시트 없음');
    if (pSheet.getLastRow() < 2) return { ok: true, items: [] };

    var pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 14).getValues();

    // 검토 시트 매핑 (key: 접수번호|부서 → review)
    var reviewMap = {};
    var rSheet = ss.getSheetByName('검토');
    if (rSheet && rSheet.getLastRow() > 1) {
      var rRows = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 8).getValues();
      rRows.forEach(function(r) {
        var key = String(r[1]) + '|' + String(r[2]);
        reviewMap[key] = {
          dept: String(r[2]),
          reviewer: String(r[3]),
          date: dreamFmtDate_(r[4]),
          opinion: String(r[5] || ''),
          status: String(r[6] || '')
        };
      });
    }

    var items = [];
    pRows.forEach(function(p) {
      var targetDepts = String(p[5] || '').split(',')
        .map(function(s){return s.trim();}).filter(Boolean);
      if (targetDepts.indexOf(info.dept) < 0) return; // 본인 부서 미배정

      var receiptNo = String(p[0]);
      var myKey = receiptNo + '|' + info.dept;
      var myRv = reviewMap[myKey] || { status: '', opinion: '' };

      // 다른 부서 검토 의견 (본인 완료 시만)
      var others = [];
      if (myRv.status === '완료') {
        targetDepts.forEach(function(d) {
          if (d === info.dept) return;
          var otherRv = reviewMap[receiptNo + '|' + d];
          if (otherRv && otherRv.status === '완료') {
            others.push({ dept: otherRv.dept, date: otherRv.date, opinion: otherRv.opinion });
          }
        });
      }

      items.push({
        receiptNo: receiptNo,
        title: String(p[6]),
        category: String(p[4]),
        targetDepts: targetDepts,
        reason: String(p[7]),
        method: String(p[8]),
        effect: String(p[9] || ''),
        anonymousUrl: String(p[11] || ''),
        status: String(p[12] || ''),
        myStatus: myRv.status || '대기',
        myOpinion: myRv.opinion || '',
        otherReviews: others
      });
    });

    // 정렬: 대기 → 작성중 → 완료, 접수번호 오름차순
    var sOrder = { '대기': 0, '작성중': 1, '완료': 2 };
    items.sort(function(a, b) {
      var oa = sOrder[a.myStatus] !== undefined ? sOrder[a.myStatus] : 0;
      var ob = sOrder[b.myStatus] !== undefined ? sOrder[b.myStatus] : 0;
      if (oa !== ob) return oa - ob;
      return a.receiptNo < b.receiptNo ? -1 : 1;
    });

    return { ok: true, items: items };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ── 검토 의견 저장 (신규 추가 or 업데이트) ───────────
//   ※ 검토자 이름은 위원 시트가 아니라 클라이언트가 보낸 reviewerName을 사용
//     (팀당 1코드 + 작성자가 매번 본인 이름 입력하는 모델)
function dreamSaveReview(data) {
  try {
    if (!data || !data.code || !data.receiptNo) throw new Error('필수 데이터 누락');
    var info = dreamFindReviewer_(data.code);
    if (!info || info.role !== '검토위원') return { ok: false, error: '권한 없음' };

    var reviewerName = String(data.reviewerName || '').trim();
    if (!reviewerName) return { ok: false, error: '검토자 이름이 누락되었습니다.' };

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var rSheet = ss.getSheetByName('검토');
    if (!rSheet) throw new Error('검토 시트 없음');

    var receiptNo = String(data.receiptNo).trim();
    var opinion = String(data.opinion || '').trim();
    var status = String(data.status || '작성중'); // 작성중 or 완료
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    // 부서별 검토 행 찾기 (한 부서 = 1행)
    var existingRow = -1;
    if (rSheet.getLastRow() > 1) {
      var rows = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 8).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][1]) === receiptNo && String(rows[i][2]) === info.dept) {
          existingRow = i + 2;
          if (String(rows[i][6]) === '완료') {
            return { ok: false, error: '이미 완료된 검토입니다. 수정이 필요하면 관리자에 문의하세요.' };
          }
          break;
        }
      }
    }

    if (existingRow > 0) {
      // 기존 행 update
      rSheet.getRange(existingRow, 4).setValue(reviewerName);  // D 검토자 (클라이언트 입력)
      rSheet.getRange(existingRow, 5).setValue(now);            // E 검토일시
      rSheet.getRange(existingRow, 6).setValue(opinion);        // F 검토의견
      rSheet.getRange(existingRow, 7).setValue(status);         // G 상태
    } else {
      // 신규 행 추가
      rSheet.appendRow([
        'RV-' + receiptNo + '-' + info.dept,  // A 검토ID
        receiptNo,                              // B 접수번호
        info.dept,                              // C 검토부서
        reviewerName,                           // D 검토자 (클라이언트 입력)
        now,                                    // E 검토일시
        opinion,                                // F 검토의견
        status,                                 // G 상태
        ''                                      // H PDF링크 (현재 미사용)
      ]);
    }

    // 완료 시 제안 시트의 상태 업데이트
    if (status === '완료') {
      dreamUpdateProposalStatus_(receiptNo);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// ── 제안의 모든 담당부서 검토가 끝나면 '심사중'으로 ──
function dreamUpdateProposalStatus_(receiptNo) {
  var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
  var pSheet = ss.getSheetByName('제안');
  if (!pSheet || pSheet.getLastRow() < 2) return;

  var pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 14).getValues();
  var targetDepts = null;
  var targetRow = -1;
  for (var i = 0; i < pRows.length; i++) {
    if (String(pRows[i][0]) === receiptNo) {
      targetDepts = String(pRows[i][5] || '').split(',')
        .map(function(s){return s.trim();}).filter(Boolean);
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow < 0 || !targetDepts) return;

  var completedDepts = [];
  var rSheet = ss.getSheetByName('검토');
  if (rSheet && rSheet.getLastRow() > 1) {
    var rRows = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 8).getValues();
    rRows.forEach(function(r) {
      if (String(r[1]) === receiptNo && String(r[6]) === '완료') {
        completedDepts.push(String(r[2]));
      }
    });
  }

  var allDone = targetDepts.every(function(d) { return completedDepts.indexOf(d) >= 0; });
  var newStatus = allDone ? '심사중' : '검토중';
  pSheet.getRange(targetRow, 13).setValue(newStatus); // M 상태
}
