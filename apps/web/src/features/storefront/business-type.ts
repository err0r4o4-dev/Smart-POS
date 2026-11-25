export function normalizeBusinessType(type: string | undefined) {
  return type?.trim().toUpperCase() ?? '';
}

export function businessTypeLabel(type: string, language: string) {
  const labels: Record<string, [string, string]> = {
    RESTAURANT: ['ร้านอาหาร', 'Restaurant'],
    CAFE: ['คาเฟ่', 'Cafe'],
    BAKERY: ['เบเกอรี่', 'Bakery'],
    FAST_FOOD: ['ฟาสต์ฟู้ด', 'Fast food'],
    BAR: ['บาร์', 'Bar'],
    RETAIL: ['ร้านค้าปลีก', 'Retail'],
    '': ['ไม่ระบุประเภท', 'Unspecified'],
  };
  return labels[type]?.[language === 'th' ? 0 : 1] ?? type;
}
