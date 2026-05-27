/**
 * 혁신드림제안 - 관리자용 운영시트 조회·결과 입력
 *
 * [Code.gs doPost switch에 추가할 2줄]
 *   case 'dreamGetAdminProposals': result = dreamGetAdminProposals(d); break;
 *   case 'dreamSetResult':         result = dreamSetResult(d); break;
 */

// 모든 제안 + 각 제안별 검토 의견 + 심사 로우 점수 통합 조회
function dreamGetAdminProposals(data) {
  try {
    if (!data || !data.pw || !checkAdmin(data.pw)) return { ok: false, error: '권한 없음' };

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var pSheet = ss.getSheetByName('제안');
    if (!pSheet) return { ok: false, error: '제안 시트 없음' };
    if (pSheet.getLastRow() < 2) return { ok: true, items: [] };

    var pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 14).getValues();

    // 검토 매핑 (접수번호별 의견들)
    var reviewsByReceipt = {};
    var rSheet = ss.getSheetByName('검토');
    if (rSheet && rSheet.getLastRow() > 1) {
      var rRows = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 8).getValues();
      rRows.forEach(function(r) {
        var key = String(r[1]);
        if (!reviewsByReceipt[key]) reviewsByReceipt[key] = [];
        reviewsByReceipt[key].push({
          dept: String(r[2]),
          reviewer: String(r[3]),
          date: dreamFmtDate_(r[4]),
          opinion: String(r[5] || ''),
          status: String(r[6] || '')
        });
      });
    }

    // 심사 매핑 (접수번호별 위원 로우 점수)
    var scoresByReceipt = {};
    var sSheet = ss.getSheetByName('심사');
    if (sSheet && sSheet.getLastRow() > 1) {
      var sRows = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, 15).getValues();
      sRows.forEach(function(s) {
        var key = String(s[1]);
        if (!scoresByReceipt[key]) scoresByReceipt[key] = [];
        scoresByReceipt[key].push({
          judge: String(s[2]),
          date: dreamFmtDate_(s[3]),
          feasibility: Number(s[4] || 0),
          creativity:  Number(s[5] || 0),
          effect:      Number(s[6] || 0),
          efficiency:  Number(s[7] || 0),
          scope:       Number(s[8] || 0),
          sustain:     Number(s[9] || 0),
          effort:      Number(s[10] || 0),
          total:       Number(s[11] || 0),
          opinion:     String(s[12] || ''),
          status:      String(s[13] || '')
        });
      });
    }

    var items = pRows.map(function(p) {
      var receiptNo = String(p[0]);
      var targetDepts = String(p[5] || '').split(',')
        .map(function(s){return s.trim();}).filter(Boolean);
      var revs = reviewsByReceipt[receiptNo] || [];
      var doneDepts = revs.filter(function(r){ return r.status === '완료'; }).length;

      return {
        receiptNo: receiptNo,
        name: String(p[1]),
        dept: String(p[2]),
        submittedAt: dreamFmtDate_(p[3]),
        category: String(p[4]),
        targetDepts: targetDepts,
        title: String(p[6]),
        reason: String(p[7]),
        method: String(p[8]),
        effect: String(p[9] || ''),
        originalUrl: String(p[10] || ''),
        anonymousUrl: String(p[11] || ''),
        status: String(p[12] || ''),
        result: String(p[13] || ''),
        reviewDone: doneDepts,
        reviewTotal: targetDepts.length,
        reviews: revs,
        scores: scoresByReceipt[receiptNo] || []
      };
    });

    // 최신순(접수번호 내림차순)
    items.sort(function(a, b) {
      return a.receiptNo < b.receiptNo ? 1 : -1;
    });

    return { ok: true, items: items };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// 최종결과 저장 (최우수/우수/장려/특별상/미채택)
function dreamSetResult(data) {
  try {
    if (!data || !data.pw || !checkAdmin(data.pw)) return { ok: false, error: '권한 없음' };
    if (!data.receiptNo) throw new Error('receiptNo 누락');

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var pSheet = ss.getSheetByName('제안');
    if (!pSheet || pSheet.getLastRow() < 2) throw new Error('제안 없음');

    var receiptNo = String(data.receiptNo).trim();
    var result = String(data.result || '').trim();

    var rows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === receiptNo) {
        pSheet.getRange(i + 2, 14).setValue(result); // N 결과
        if (result && result !== '심사중') {
          pSheet.getRange(i + 2, 13).setValue('심사완료'); // M 상태 → 심사완료
        }
        return { ok: true };
      }
    }
    return { ok: false, error: '해당 접수번호를 찾을 수 없습니다.' };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}
