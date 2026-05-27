/**
 * 혁신드림제안 - 심사위원 시스템
 *
 * [기능]
 *   1) dreamJudgeLogin: 코드 검증 + 심사위원 역할 확인
 *   2) dreamGetJudgeItems: 심사 대상(상태=심사중) 제안 + 본인 점수 + 검토부서 의견
 *   3) dreamSaveScore: 점수 저장 (임시저장 or 제출완료)
 *      (심사위원별 1행, 같은 위원이 같은 제안 재호출 시 update)
 *
 * [Code.gs doPost switch에 추가할 3줄]
 *   case 'dreamJudgeLogin':       result = dreamJudgeLogin(d); break;
 *   case 'dreamGetJudgeItems':    result = dreamGetJudgeItems(d); break;
 *   case 'dreamSaveScore':        result = dreamSaveScore(d); break;
 */

// 본인이 임시저장한 모든 심사를 일괄 제출완료로 변경
function dreamFinalizeJudge(data) {
  try {
    if (!data || !data.code) throw new Error('코드 누락');
    var info = dreamFindJudge_(data.code);
    if (!info || info.role !== '심사위원') return { ok: false, error: '권한 없음' };
    var judgeName = String(info.name || '').trim();
    if (!judgeName) return { ok: false, error: '위원 이름이 등록되지 않음' };

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var sSheet = ss.getSheetByName('심사');
    if (!sSheet || sSheet.getLastRow() < 2) return { ok: false, error: '심사 데이터 없음' };

    var rows = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, 15).getValues();
    var updated = 0;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][2]).trim() === judgeName && String(rows[i][13]) === '임시저장') {
        sSheet.getRange(i + 2, 14).setValue('제출완료'); // N 상태
        updated++;
      }
    }
    return { ok: true, updated: updated };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// 위원 시트에서 심사위원 코드 매칭 (역할='심사위원'만)
function dreamFindJudge_(code) {
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

function dreamJudgeLogin(data) {
  try {
    if (!data || !data.code) throw new Error('코드를 입력해주세요.');
    var info = dreamFindJudge_(data.code);
    if (!info) return { ok: false, error: '유효하지 않은 코드입니다.' };
    if (info.role !== '심사위원') return { ok: false, error: '심사위원 코드가 아닙니다.' };
    // 위원 시트의 이름을 그대로 반환 → 클라이언트가 사용
    return { ok: true, judge: { name: info.name, dept: info.dept } };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function dreamGetJudgeItems(data) {
  try {
    if (!data || !data.code) throw new Error('코드 누락');
    var info = dreamFindJudge_(data.code);
    if (!info || info.role !== '심사위원') return { ok: false, error: '권한 없음' };
    // 위원 시트의 이름 사용 (클라이언트 입력 무시 — 보안)
    var judgeName = String(info.name || '').trim();

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var pSheet = ss.getSheetByName('제안');
    if (!pSheet) throw new Error('제안 시트 없음');
    if (pSheet.getLastRow() < 2) return { ok: true, items: [] };

    var pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 14).getValues();

    // 검토 시트 매핑 (접수번호별 완료 의견들)
    var reviewsByReceipt = {};
    var rSheet = ss.getSheetByName('검토');
    if (rSheet && rSheet.getLastRow() > 1) {
      var rRows = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 8).getValues();
      rRows.forEach(function(r) {
        if (String(r[6]) !== '완료') return;
        var key = String(r[1]);
        if (!reviewsByReceipt[key]) reviewsByReceipt[key] = [];
        reviewsByReceipt[key].push({
          dept: String(r[2]),
          reviewer: String(r[3]),
          opinion: String(r[5] || '')
        });
      });
    }

    // 심사 시트 매핑 (접수번호+위원이름별 본인 점수)
    var myScoresMap = {};
    var sSheet = ss.getSheetByName('심사');
    if (sSheet && sSheet.getLastRow() > 1) {
      var sRows = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, 15).getValues();
      sRows.forEach(function(s) {
        if (String(s[2]).trim() !== judgeName) return;
        var key = String(s[1]);
        myScoresMap[key] = {
          scores: {
            feasibility: Number(s[4] || 0),
            creativity:  Number(s[5] || 0),
            effect:      Number(s[6] || 0),
            efficiency:  Number(s[7] || 0),
            scope:       Number(s[8] || 0),
            sustain:     Number(s[9] || 0),
            effort:      Number(s[10] || 0)
          },
          total: Number(s[11] || 0),
          opinion: String(s[12] || ''),
          status: String(s[13] || '')
        };
      });
    }

    var items = [];
    pRows.forEach(function(p) {
      // 모든 제안 표시 (검토 완료 여부 무관) — 심사위원이 전체 제안을 평가
      var receiptNo = String(p[0]);
      var my = myScoresMap[receiptNo] || { scores: {}, total: 0, opinion: '', status: '' };

      items.push({
        receiptNo: receiptNo,
        title: String(p[6]),
        category: String(p[4]),
        reason: String(p[7]),
        method: String(p[8]),
        effect: String(p[9] || ''),
        anonymousUrl: String(p[11] || ''),
        reviews: reviewsByReceipt[receiptNo] || [],
        myScores: my.scores,
        myTotal: my.total,
        myOpinion: my.opinion,
        myStatus: my.status || '대기'
      });
    });

    // 정렬: 접수번호 오름차순 (상태별 정렬 X — 채점 후 위치 변동 방지)
    items.sort(function(a, b) {
      return a.receiptNo < b.receiptNo ? -1 : 1;
    });

    return { ok: true, items: items };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function dreamSaveScore(data) {
  try {
    if (!data || !data.code || !data.receiptNo) throw new Error('필수 데이터 누락');
    var info = dreamFindJudge_(data.code);
    if (!info || info.role !== '심사위원') return { ok: false, error: '권한 없음' };
    // 클라이언트가 보낸 judgeName은 무시 — 위원 시트의 이름을 그대로 사용 (보안)
    var judgeName = String(info.name || '').trim();
    if (!judgeName) return { ok: false, error: '위원 시트에 이름이 등록되지 않았습니다.' };

    var receiptNo = String(data.receiptNo).trim();
    var scores = data.scores || {};
    var total = Number(data.total || 0);
    var opinion = String(data.opinion || '').trim();
    var status = String(data.status || '임시저장'); // 임시저장 or 제출완료
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var sSheet = ss.getSheetByName('심사');
    if (!sSheet) throw new Error('심사 시트 없음');

    // 같은 (접수번호, 심사위원이름) 행 찾기
    var existingRow = -1;
    if (sSheet.getLastRow() > 1) {
      var rows = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, 15).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][1]) === receiptNo && String(rows[i][2]).trim() === judgeName) {
          existingRow = i + 2;
          if (String(rows[i][13]) === '제출완료') {
            return { ok: false, error: '이미 제출 완료된 심사입니다.' };
          }
          break;
        }
      }
    }

    var rowData = [
      'JD-' + receiptNo + '-' + judgeName,  // A 심사ID
      receiptNo,                              // B 접수번호
      judgeName,                              // C 심사위원
      now,                                    // D 심사일시
      Number(scores.feasibility || 0),        // E 실시가능성
      Number(scores.creativity  || 0),        // F 창의성
      Number(scores.effect      || 0),        // G 효과성
      Number(scores.efficiency  || 0),        // H 효율성
      Number(scores.scope       || 0),        // I 적용범위
      Number(scores.sustain     || 0),        // J 지속성
      Number(scores.effort      || 0),        // K 노력도구체성
      total,                                  // L 합계
      opinion,                                // M 심사의견
      status,                                 // N 상태
      ''                                      // O PDF링크
    ];

    if (existingRow > 0) {
      sSheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sSheet.appendRow(rowData);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}
