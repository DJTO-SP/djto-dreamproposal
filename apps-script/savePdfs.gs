/**
 * 혁신드림제안 - PDF 2개(원본/익명) Drive 저장 + 시트 링크 채움
 *
 * [호출 흐름]
 *   1. dreamAddProposal로 접수번호 발급 + 시트 행 추가
 *   2. 클라이언트에서 PDF 2개 생성 후 base64로 인코딩
 *   3. dreamSavePdfs로 호출 → Drive 업로드 → 시트 원본링크/익명링크 컬럼 채움
 *
 * [Code.gs doPost switch에 추가할 한 줄]
 *   case 'dreamSavePdfs':   result = dreamSavePdfs(d); break;
 */

/**
 * PDF 두 개를 Drive에 저장하고 시트 링크 채움
 * @param {Object} data - { receiptNo, originalPdf (base64), anonymousPdf (base64) }
 * @return {Object} { ok: true, originalUrl, anonymousUrl } 또는 { ok: false, error }
 */
function dreamSavePdfs(data) {
  try {
    if (!data || !data.receiptNo) throw new Error('receiptNo가 비어있습니다.');
    if (!data.originalPdf)        throw new Error('originalPdf가 비어있습니다.');
    // anonymousPdf는 첨부 없으면 빈 값 OK (익명 PDF 생성 안 함)

    var receiptNo = String(data.receiptNo);

    var folders = dreamGetCurrentHalfFolders_();
    var proposalFolder = folders.proposal;

    // 원본 PDF (표지 + 첨부) — 관리자 보관용, 비공개 유지
    var origBlob = Utilities.newBlob(
      Utilities.base64Decode(data.originalPdf),
      'application/pdf',
      receiptNo + '_제안서_원본.pdf'
    );
    var origFile = proposalFolder.createFile(origBlob);

    // 익명 PDF (첨부만) — 위원·본인 공개용. 첨부 없으면 생성 안 함
    var anonFile = null;
    if (data.anonymousPdf) {
      var anonBlob = Utilities.newBlob(
        Utilities.base64Decode(data.anonymousPdf),
        'application/pdf',
        receiptNo + '_첨부자료.pdf'
      );
      anonFile = proposalFolder.createFile(anonBlob);
      // 링크 있는 사람 누구나 보기 가능 (위원/본인이 접근)
      anonFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    // 시트 update
    var ss = SpreadsheetApp.openById(DREAM_SHEET_ID);
    var sheet = ss.getSheetByName('제안');
    if (!sheet) throw new Error('"제안" 시트가 없습니다.');

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var receipts = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < receipts.length; i++) {
        if (String(receipts[i][0]) === receiptNo) {
          sheet.getRange(i + 2, 11).setValue(origFile.getUrl());                   // K 원본링크
          sheet.getRange(i + 2, 12).setValue(anonFile ? anonFile.getUrl() : '');   // L 익명링크 (없으면 빈 칸)
          break;
        }
      }
    }

    return {
      ok: true,
      originalUrl: origFile.getUrl(),
      anonymousUrl: anonFile ? anonFile.getUrl() : ''
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * 편집기 테스트용 — 가짜 base64 PDF로 함수 동작 확인
 * 실제 PDF base64는 길어서 여기선 미리 만들어둔 접수번호로 시트만 update 시뮬레이션
 */
function dreamTestSavePdfs() {
  // 최소 유효 PDF (1 페이지 빈 PDF의 base64)
  var minimalPdfBase64 =
    'JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PC9MZW5ndGggMTQ0Ci9GaWx0ZXIvRmxhdGVE' +
    'ZWNvZGU+PnN0cmVhbQp4nE2OQQrCMBBF93OK/wByALdSiBpQUKQrxX0J0wRpkpJOBG/v' +
    'JCDi6vN5j/8mLDmAo5KqJqGgkSAQ8oiBUlSvLjjyAaUJ/PKr34D8RTHALsKBHHrlz0Yt' +
    'wOdoLeS3qz/oOoFKqkwGZqfYDl4Jq9k47fIyDZ1xC7gE3FUmO+Cak8WvDtkXuG8u0gpl' +
    'bmVuZHN0cmVhbQplbmRvYmoKMSAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIv' +
    'UmVzb3VyY2VzPDwvUHJvY1NldCBbL1BERl0vRm9udDw8Pj4+Pi9NZWRpYUJveFswIDAg' +
    'NjEyIDc5Ml0vQ29udGVudHMgMyAwIFI+PgplbmRvYmoKMiAwIG9iajw8L1R5cGUvUGFn' +
    'ZXMvS2lkc1sxIDAgUl0vQ291bnQgMT4+CmVuZG9iagp0cmFpbGVyPDwvUm9vdDw8L1R5' +
    'cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+L1NpemUgND4+CiUlRU9G';

  var result = dreamSavePdfs({
    receiptNo: '2026-H1-001',  // ← 실제 시트에 있는 접수번호로 바꿔서 테스트
    originalPdf: minimalPdfBase64,
    anonymousPdf: minimalPdfBase64
  });
  Logger.log(JSON.stringify(result));
}
