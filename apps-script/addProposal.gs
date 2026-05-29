/**
 * 혁신드림제안 - 접수 처리
 *
 * [호출 방식]
 *   클라이언트(script.js)가 doPost로 호출:
 *     fetch(SCRIPT_URL, {
 *       method: 'POST',
 *       body: JSON.stringify({
 *         action: 'dreamSubmit',
 *         name, dept, category, targetDepts:[], title, reason, method, effect
 *       })
 *     })
 *
 * [Code.gs의 doPost switch에 추가할 한 줄]
 *   기존 'submitProposal' 케이스 다음 줄에 추가:
 *     case 'dreamSubmit':     result = dreamAddProposal(d); break;
 *
 *   ※ 기존 'submitProposal' 액션은 통합관리대장용이라 충돌 방지 위해
 *     우리 새 액션은 'dreamSubmit' 이름을 사용함.
 *
 * [현재 단계 3b]
 *   - 시트 `제안`에 행 추가
 *   - 접수번호(YYYY-H1-NNN) 자동 발급
 *   - 원본PDF/익명PDF 링크는 3c 단계에서 채움 (지금은 빈 칸)
 */

/**
 * 접수 메인 함수
 * @param {Object} data - { name, dept, category, targetDepts[], title, reason, method, effect }
 * @return {Object} { ok: true, receiptNo } 또는 { ok: false, error }
 */
function dreamAddProposal(data) {
  try {
    if (!data) throw new Error('데이터가 비어있습니다.');

    // 필수 필드 검증
    var required = ['name', 'dept', 'category', 'title', 'reason', 'method'];
    for (var i = 0; i < required.length; i++) {
      if (!data[required[i]] || String(data[required[i]]).trim() === '') {
        throw new Error('필수 항목이 누락되었습니다: ' + required[i]);
      }
    }
    if (!Array.isArray(data.targetDepts) || data.targetDepts.length === 0) {
      throw new Error('담당부서를 1개 이상 선택해야 합니다.');
    }

    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var sheet = ss.getSheetByName('제안');
    if (!sheet) throw new Error('"제안" 시트가 없습니다. setup() 먼저 실행하세요.');

    // 접수번호 발급
    var receiptNo = dreamIssueReceiptNo_(sheet);

    // 제안일시 (한국 시간)
    var submittedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    // 그룹원 (선택)
    var members = Array.isArray(data.members)
      ? data.members.map(function(m){ return String(m).trim(); }).filter(Boolean)
      : [];

    // 시트에 행 추가 (15개 컬럼)
    sheet.appendRow([
      receiptNo,                         // A 접수번호
      String(data.name).trim(),          // B 성명 (개인=본인, 그룹=대표자)
      String(data.dept).trim(),          // C 소속
      submittedAt,                       // D 제안일시
      String(data.category).trim(),      // E 제안부문
      data.targetDepts.join(','),        // F 담당부서 (콤마 구분)
      String(data.title).trim(),         // G 제목
      String(data.reason).trim(),        // H 제안사유
      String(data.method).trim(),        // I 실시방법
      String(data.effect || '').trim(),  // J 기대효과 (선택)
      '',                                // K 원본링크
      '',                                // L 익명링크
      '접수완료',                        // M 상태
      '',                                // N 결과
      members.join(', ')                 // O 구성원 (그룹원 이름, 빈값=개인)
    ]);

    return { ok: true, receiptNo: receiptNo };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * 접수번호 자동 발급
 * - 현재 반기의 마지막 번호 + 1
 * - 형식: YYYY-H1-NNN  (예: 2026-H1-007)
 * - H1 = 1~6월, H2 = 7~12월
 */
function dreamIssueReceiptNo_(sheet) {
  var today = new Date();
  var year = today.getFullYear();
  var half = today.getMonth() < 6 ? 'H1' : 'H2';
  var prefix = year + '-' + half + '-';

  var maxN = 0;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var nums = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < nums.length; i++) {
      var v = String(nums[i][0] || '');
      if (v.indexOf(prefix) === 0) {
        var n = parseInt(v.substring(prefix.length), 10);
        if (!isNaN(n) && n > maxN) maxN = n;
      }
    }
  }

  var newN = String(maxN + 1);
  while (newN.length < 3) newN = '0' + newN;
  return prefix + newN;
}

/**
 * 편집기 테스트용 — Apps Script 편집기에서 직접 실행해 동작 확인
 */
function dreamTestAddProposal() {
  var result = dreamAddProposal({
    name: '테스트',
    dept: '전략기획팀',
    category: '조직혁신',
    targetDepts: ['전략기획팀', '홍보마케팅팀'],
    title: '테스트 제안',
    reason: '테스트 사유입니다.',
    method: '테스트 방법입니다.',
    effect: '테스트 효과'
  });
  Logger.log(JSON.stringify(result));
}
