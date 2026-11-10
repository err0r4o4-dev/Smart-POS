import Swal from 'sweetalert2';
import { ApiError } from '../../lib/api';
import './feedback.css';

export function dismissSuccessFeedback() {
  if (Swal.getPopup()?.classList.contains('swal2-toast')) Swal.close();
}

function escapedText(value: string) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

export async function successFeedback(
  title: string,
  closeLabel: string,
  text?: string,
) {
  try {
    if (Swal.isVisible() && !Swal.getPopup()?.classList.contains('swal2-toast'))
      return;
    await Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      titleText: title,
      text,
      showConfirmButton: false,
      showCloseButton: true,
      closeButtonAriaLabel: closeLabel,
      timer: 5000,
      timerProgressBar: true,
      customClass: { popup: 'smartpos-feedback' },
      willOpen: (popup) => popup.setAttribute('role', 'status'),
      didOpen: (popup) => {
        popup.addEventListener('mouseenter', () => Swal.stopTimer());
        popup.addEventListener('mouseleave', () => {
          if (!popup.contains(document.activeElement)) Swal.resumeTimer();
        });
        popup.addEventListener('focusin', () => Swal.stopTimer());
        popup.addEventListener('focusout', (event) => {
          if (
            !popup.contains(event.relatedTarget as Node | null) &&
            !popup.matches(':hover')
          )
            Swal.resumeTimer();
        });
      },
    });
  } catch {
    return;
  }
}

export async function confirmFeedback(options: {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
}): Promise<boolean> {
  const result = await Swal.fire({
    titleText: options.title,
    text: options.text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: escapedText(options.confirmLabel),
    cancelButtonText: escapedText(options.cancelLabel),
    focusCancel: true,
    returnFocus: true,
    customClass: { popup: 'smartpos-feedback' },
  });
  return result.isConfirmed;
}

export function accountFailure(failure: unknown, en: boolean): string {
  const status = failure instanceof ApiError ? failure.status : 0;
  if (status === 429)
    return en
      ? 'Too many requests. Please wait before trying again.'
      : 'ขอทำรายการถี่เกินไป กรุณารอก่อนลองอีกครั้ง';
  if (status === 401)
    return en
      ? 'Could not sign in. Check your email and password, then try again.'
      : 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่านแล้วลองอีกครั้ง';
  if (status === 400 || status === 409)
    return en
      ? 'Could not complete this request. Check your details. If using a link, it may be invalid or expired; request a new one.'
      : 'ทำรายการไม่ได้ กรุณาตรวจสอบข้อมูล หากใช้ลิงก์ ลิงก์อาจไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่';
  if (status === 403)
    return en
      ? 'This action is not available for this account. Return to sign in and check your account.'
      : 'บัญชีนี้ยังทำรายการดังกล่าวไม่ได้ กรุณากลับไปเข้าสู่ระบบและตรวจสอบบัญชี';
  return en
    ? 'Could not confirm the result. Check your connection and the account status before trying again.'
    : 'ยังยืนยันผลรายการไม่ได้ กรุณาตรวจสอบการเชื่อมต่อและสถานะบัญชีก่อนทำซ้ำ';
}
