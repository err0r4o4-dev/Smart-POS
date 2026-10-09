const code128Widths = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];
const leftPatterns = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const oddPatterns = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];
const parity = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];
function checksum(code: string) {
  let sum = 0;
  for (let index = 0; index < code.length - 1; index++)
    sum += Number(code[index]) * ((code.length - 2 - index) % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(code.at(-1));
}
export function barcodeBits(code: string, symbology: string): string {
  if (symbology === 'CODE128') {
    if (!/^[ -~]{1,80}$/.test(code))
      throw new Error('Code 128 ต้องเป็น ASCII 1–80 ตัวอักษร');
    const symbols = [
      104,
      ...Array.from(code, (character) => character.charCodeAt(0) - 32),
    ];
    let sum = 104;
    for (let index = 1; index < symbols.length; index++)
      sum += symbols[index] * index;
    symbols.push(sum % 103, 106);
    return symbols
      .map((symbol) =>
        Array.from(code128Widths[symbol], (width, index) =>
          (index % 2 === 0 ? '1' : '0').repeat(Number(width)),
        ).join(''),
      )
      .join('');
  }
  const lengths: Record<string, number> = { EAN13: 13, EAN8: 8, UPCA: 12 };
  if (
    !lengths[symbology] ||
    !/^\d+$/.test(code) ||
    code.length !== lengths[symbology] ||
    !checksum(code)
  )
    throw new Error('Barcode checksum ไม่ถูกต้อง');
  if (symbology === 'UPCA') code = '0' + code;
  const ean8 = symbology === 'EAN8';
  const half = ean8 ? 4 : 6;
  const digits = ean8 ? code : code.slice(1);
  const layout = ean8 ? 'LLLL' : parity[Number(code[0])];
  const left = Array.from(
    digits.slice(0, half),
    (digit, index) =>
      (layout[index] === 'L' ? leftPatterns : oddPatterns)[Number(digit)],
  ).join('');
  const right = Array.from(digits.slice(half), (digit) =>
    leftPatterns[Number(digit)].replace(/[01]/g, (bit) =>
      bit === '1' ? '0' : '1',
    ),
  ).join('');
  return '101' + left + '01010' + right + '101';
}
