// Nén ảnh ngay trên trình duyệt rồi lưu dạng dataURL trong Firestore.
// Không dùng Firebase Storage vì từ 2024 Storage bắt buộc gói trả phí (Blaze).
const MAX_BYTES = 300 * 1024; // giữ mỗi ảnh ≤ ~300 KB (giới hạn 1 document Firestore là 1 MB)

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Không đọc được ảnh.'));
    img.src = url;
  });
}

const sizeOf = (dataUrl) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

export async function compressImage(file, maxSide = 1000) {
  if (!file.type.startsWith('image/')) throw new Error('Vui lòng chọn file ảnh (PNG, JPG).');
  const img = await loadImage(file);
  let side = maxSide;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    // Hình vẽ hình học (ít màu) giữ PNG cho nét; ảnh chụp chuyển JPEG
    const png = canvas.toDataURL('image/png');
    if (sizeOf(png) <= MAX_BYTES) return { data: png, w, h };
    const jpg = canvas.toDataURL('image/jpeg', 0.82);
    if (sizeOf(jpg) <= MAX_BYTES) return { data: jpg, w, h };
    side = Math.round(side * 0.75);
  }
  throw new Error('Ảnh quá lớn, vui lòng cắt bớt rồi thử lại.');
}
