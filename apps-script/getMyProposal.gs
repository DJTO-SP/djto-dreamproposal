/**
 * 혁신드림제안 - 내 제안 확인 조회
 *
 * [호출 흐름]
 *   사용자가 [내 제안] 탭에서 접수번호 + 이름 입력 → 조회
 *   서버는 두 값이 모두 일치하는 행을 찾아 반환
 *
 * [Code.gs doPost switch에 추가할 한 줄]
 *   case 'dreamGetMyProposal':   result = dreamGetMyProposal(d); break;
 */

/**
 * @param {Object} data - { receiptNo, name }
 * @return {Object} { ok: true, proposal:{}, reviews:[], scores:[] } 또는 { ok:false, error }
 */
function dreamGetMyProposal(data) {
  try {
    if (!data || !data.receiptNo || !data.name) {
      throw new Error('접수번호와 이름을 입력해주세요.');
    }
    var receiptNo = String(data.receiptNo).trim();
    var name = String(data.name).trim();

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var sheet = ss.getSheetByName('제안');
    if (!sheet) throw new Error('"제안" 시트가 없습니다.');

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: '조회 결과가 없습니다.' };

    // 제안 시트 15컬럼 모두 가져오기 (구성원 컬럼 포함)
    var rows = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    var found = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === receiptNo &&
          String(rows[i][1]).trim() === name) {
        found = rows[i];
        break;
      }
    }

    if (!found) return { ok: false, error: '접수번호와 이름이 일치하지 않습니다.\n다시 확인해주세요.' };

    // 검토 조회
    var reviews = [];
    var reviewSheet = ss.getSheetByName('검토');
    if (reviewSheet && reviewSheet.getLastRow() > 1) {
      var rvRows = reviewSheet.getRange(2, 1, reviewSheet.getLastRow() - 1, 8).getValues();
      for (var j = 0; j < rvRows.length; j++) {
        if (String(rvRows[j][1]).trim() === receiptNo) {
          reviews.push({
            dept: String(rvRows[j][2] || ''),
            reviewer: String(rvRows[j][3] || ''),
            date: dreamFmtDate_(rvRows[j][4]),
            opinion: String(rvRows[j][5] || ''),
            status: String(rvRows[j][6] || '')
          });
        }
      }
    }

    // 심사 조회 (제출완료된 것만)
    var scores = [];
    var scoreSheet = ss.getSheetByName('심사');
    if (scoreSheet && scoreSheet.getLastRow() > 1) {
      var sRows = scoreSheet.getRange(2, 1, scoreSheet.getLastRow() - 1, 15).getValues();
      for (var k = 0; k < sRows.length; k++) {
        if (String(sRows[k][1]).trim() === receiptNo && String(sRows[k][13]) === '제출완료') {
          scores.push({
            judge: String(sRows[k][2] || ''),
            date: dreamFmtDate_(sRows[k][3]),
            total: Number(sRows[k][11] || 0),
            opinion: String(sRows[k][12] || '')
          });
        }
      }
    }

    // 담당부서 콤마 split
    var targetDepts = String(found[5] || '').split(',')
      .map(function(s) { return s.trim(); })
      .filter(Boolean);

    return {
      ok: true,
      proposal: {
        receiptNo:   String(found[0]),
        name:        String(found[1]),
        dept:        String(found[2]),
        submittedAt: dreamFmtDate_(found[3]),
        category:    String(found[4]),
        targetDepts: targetDepts,
        title:       String(found[6]),
        reason:      String(found[7]),
        method:      String(found[8]),
        effect:      String(found[9] || ''),
        attachmentUrl: String(found[11] || ''),  // 익명링크 = 첨부 자료
        status:      String(found[12] || '접수완료'),
        award:       String(found[13] || '심사중'),
        members:     String(found[14] || '').split(',').map(function(s){return s.trim();}).filter(Boolean)
      },
      reviews: reviews,
      scores: scores
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * 모든 제안의 제목 목록 (익명) — 누구나 조회 가능
 *   접수번호/제안일시/제안부문/제목/상태/결과만 반환
 *   성명·소속·내용은 절대 반환 X
 *
 * [Code.gs doPost switch에 추가할 한 줄]
 *   case 'dreamGetAllTitles': result = dreamGetAllTitles(d); break;
 */
function dreamGetAllTitles(data) {
  try {
    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var sheet = ss.getSheetByName('제안');
    if (!sheet) throw new Error('"제안" 시트가 없습니다.');
    if (sheet.getLastRow() < 2) return { ok: true, items: [] };

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
    var items = rows.map(function(p) {
      return {
        receiptNo:   String(p[0] || ''),
        submittedAt: dreamFmtDate_(p[3]),
        category:    String(p[4] || ''),
        title:       String(p[6] || ''),
        status:      String(p[12] || ''),
        result:      String(p[13] || '')
      };
    });

    // 최신순 (접수번호 내림차순)
    items.sort(function(a, b) { return a.receiptNo < b.receiptNo ? 1 : -1; });

    return { ok: true, items: items };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

/**
 * 날짜 포맷 헬퍼 (Date 객체든 문자열이든 yyyy-MM-dd HH:mm으로)
 */
function dreamFmtDate_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  }
  return String(v);
}
