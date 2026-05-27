/**
 * 혁신드림제안제도 - 시트/폴더 초기 세팅
 *
 * [사용법]
 *   Apps Script 편집기에서 setup() 함수를 한 번 실행하세요.
 *     1) 시트 4개 자동 생성: 제안 / 검토 / 심사 / 위원
 *     2) 각 시트 1행에 헤더 입력 + 스타일 적용
 *     3) Drive 폴더 구조 생성: 혁신드림제안/{연도}/{반기}/...
 *
 * [매 반기 시작 시]
 *   setup()을 다시 실행하면 새 반기 폴더(예: 2026/H2/)가 자동 생성됩니다.
 *   기존 시트는 그대로 유지되니, 반기 종료 시점에 운영시트 데이터를 백업하고
 *   비운 다음 setup()을 실행하세요.
 *
 * [주의]
 *   - Drive 폴더는 이 Apps Script를 실행한 계정의 "내 드라이브"에 생성됩니다.
 *   - 생성된 "혁신드림제안" 폴더는 익명성 보장을 위해 관리자만 접근 가능하게 두세요.
 *     (검토/심사 위원에게 폴더 공유 X — 위원 접근은 모두 Apps Script API 통해서만)
 *
 * [충돌 방지]
 *   기존 Code.gs 등과 변수명이 겹치지 않도록 모든 식별자에 DREAM_ 접두어를 붙였습니다.
 */

// 시트 ID — 기존 Code.gs의 SHEET_ID와 동일한 시트를 가리킵니다 (충돌 방지를 위해 별도 이름)
var DREAM_SHEET_ID = '1TzKHf4QxH8XqB05duVSXlSdM42_ThGJuy0C1Qewvywo';
var DREAM_DRIVE_ROOT_NAME = '혁신드림제안';

var DREAM_SHEET_HEADERS = {
  '제안': [
    '접수번호', '성명', '소속', '제안일시', '제안부문', '담당부서',
    '제목', '제안사유', '실시방법', '기대효과',
    '원본링크', '익명링크', '상태', '결과'
  ],
  '검토': [
    '검토ID', '접수번호', '검토부서', '검토자', '검토일시',
    '검토의견', '상태', 'PDF링크'
  ],
  '심사': [
    '심사ID', '접수번호', '심사위원', '심사일시',
    '실시가능성', '창의성', '효과성', '효율성', '적용범위', '지속성', '노력도구체성',
    '합계', '심사의견', '상태', 'PDF링크'
  ],
  '위원': [
    '역할', '이름', '부서', '코드'
  ]
};

var DREAM_HEADER_BG = '#204473';
var DREAM_HEADER_FG = '#ffffff';

/**
 * 메인 진입점 — Apps Script 편집기에서 직접 실행
 */
function setup() {
  dreamSetupSheets_();
  dreamSetupFolders_();
  Logger.log('✅ 시트 및 Drive 폴더 세팅 완료');
}

/**
 * 시트 4개 생성 + 헤더 입력 + 스타일 적용
 */
function dreamSetupSheets_() {
  var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);

  Object.keys(DREAM_SHEET_HEADERS).forEach(function(sheetName) {
    var headers = DREAM_SHEET_HEADERS[sheetName];
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      Logger.log('+ 시트 생성: ' + sheetName);
    } else {
      Logger.log('= 시트 존재 (헤더 갱신): ' + sheetName);
    }

    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setBackground(DREAM_HEADER_BG);
    range.setFontColor(DREAM_HEADER_FG);
    range.setFontWeight('bold');
    range.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  });
}

/**
 * Drive 폴더 구조 생성
 *   혁신드림제안/
 *     {연도}/
 *       {반기}/
 *         01_제안서원본/
 *         02_검토의견/
 *         03_심사평가/
 */
function dreamSetupFolders_() {
  var folders = dreamGetCurrentHalfFolders_();
  Logger.log('+ Drive 폴더 준비: ' + DREAM_DRIVE_ROOT_NAME + '/' + folders.year + '/' + folders.half + '/');
}

/**
 * 현재 시점의 반기 폴더 구조를 반환 (없으면 생성)
 * 다른 함수(addProposal 등)에서도 사용
 */
function dreamGetCurrentHalfFolders_() {
  var today = new Date();
  var year = today.getFullYear();
  var half = today.getMonth() < 6 ? 'H1' : 'H2';

  var root = dreamGetOrCreateFolder_(DriveApp.getRootFolder(), DREAM_DRIVE_ROOT_NAME);
  var yearFolder = dreamGetOrCreateFolder_(root, String(year));
  var halfFolder = dreamGetOrCreateFolder_(yearFolder, half);

  return {
    year: year,
    half: half,
    halfFolder: halfFolder,
    proposal: dreamGetOrCreateFolder_(halfFolder, '01_제안서원본'),
    review: dreamGetOrCreateFolder_(halfFolder, '02_검토의견'),
    judge: dreamGetOrCreateFolder_(halfFolder, '03_심사평가')
  };
}

function dreamGetOrCreateFolder_(parent, name) {
  var folders = parent.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  Logger.log('  + 폴더 생성: ' + name);
  return parent.createFolder(name);
}
