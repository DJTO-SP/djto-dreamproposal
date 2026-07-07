/**
 * 혁신드림제안 - 통합 PDF(제안서+검토의견) Drive 저장
 *
 * [기능]
 *   관리자가 접수현황에서 버튼을 누르면 클라이언트가 통합 PDF 2종을 생성해 보내고,
 *   이 함수가 Drive의 02_검토의견 폴더에 저장합니다.
 *     - {접수번호}_검토의견_원본.pdf : 제안자 성명/소속/구성원 표시
 *     - {접수번호}_검토의견_익명.pdf : 제안자 정보 비공개 처리
 *   같은 이름의 기존 파일이 있으면 휴지통으로 보내고 새 파일로 교체합니다.
 *   저장 후 '검토' 시트의 PDF링크(H열)에 원본 파일 링크를 채웁니다.
 *
 * [Code.gs doPost switch에 추가할 한 줄]
 *   case 'dreamSaveReviewPdfs': result = dreamSaveReviewPdfs(d); break;
 */

/**
 * 통합 PDF 2종을 02_검토의견 폴더에 저장
 * @param {Object} data - { pw, receiptNo, originalPdf (base64), anonymousPdf (base64) }
 * @return {Object} { ok: true, originalUrl, anonymousUrl } 또는 { ok: false, error }
 */
function dreamSaveReviewPdfs(data) {
  try {
    if (!data || !data.pw || !checkAdmin(data.pw)) return { ok: false, error: '권한 없음' };
    if (!data.receiptNo)    throw new Error('receiptNo가 비어있습니다.');
    if (!data.originalPdf)  throw new Error('originalPdf가 비어있습니다.');
    if (!data.anonymousPdf) throw new Error('anonymousPdf가 비어있습니다.');

    var receiptNo = String(data.receiptNo).trim();
    var reviewFolder = dreamGetReviewFolderForReceipt_(receiptNo);

    var origName = receiptNo + '_검토의견_원본.pdf';
    var anonName = receiptNo + '_검토의견_익명.pdf';

    // 재저장 시 기존 파일 교체
    dreamTrashFilesByName_(reviewFolder, origName);
    dreamTrashFilesByName_(reviewFolder, anonName);

    var origFile = reviewFolder.createFile(Utilities.newBlob(
      Utilities.base64Decode(data.originalPdf), 'application/pdf', origName
    ));
    var anonFile = reviewFolder.createFile(Utilities.newBlob(
      Utilities.base64Decode(data.anonymousPdf), 'application/pdf', anonName
    ));

    // '검토' 시트 PDF링크(H열) 채움 — 해당 접수번호의 모든 검토 행
    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var rSheet = ss.getSheetByName('검토');
    if (rSheet && rSheet.getLastRow() > 1) {
      var receipts = rSheet.getRange(2, 2, rSheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < receipts.length; i++) {
        if (String(receipts[i][0]) === receiptNo) {
          rSheet.getRange(i + 2, 8).setValue(origFile.getUrl()); // H PDF링크
        }
      }
    }

    return {
      ok: true,
      originalUrl: origFile.getUrl(),
      anonymousUrl: anonFile.getUrl()
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * 접수번호(예: 2026-H1-001)에서 연도/반기를 읽어 해당 02_검토의견 폴더 반환
 * 접수번호 형식이 다르면 현재 날짜 기준 반기 폴더로 폴백
 * (H1 제안을 하반기에 정리해도 올바른 반기 폴더에 저장되도록 함)
 */
function dreamGetReviewFolderForReceipt_(receiptNo) {
  var m = String(receiptNo || '').match(/^(\d{4})-(H[12])/);
  var year, half;
  if (m) {
    year = m[1];
    half = m[2];
  } else {
    var today = new Date();
    year = String(today.getFullYear());
    half = today.getMonth() < 6 ? 'H1' : 'H2';
  }
  var root = dreamGetOrCreateFolder_(DriveApp.getRootFolder(), DREAM_DRIVE_ROOT_NAME);
  var yearFolder = dreamGetOrCreateFolder_(root, year);
  var halfFolder = dreamGetOrCreateFolder_(yearFolder, half);
  return dreamGetOrCreateFolder_(halfFolder, '02_검토의견');
}

// 폴더 안에서 같은 이름의 파일을 모두 휴지통으로
function dreamTrashFilesByName_(folder, name) {
  var files = folder.getFilesByName(name);
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
}
