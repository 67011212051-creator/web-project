import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { RiderSessionService } from './rider-session.service';

// หน้านำทาง: ต้องมีรหัสใบงานก่อน ไม่มีให้กลับไปกรอกที่หน้า /rider
export const riderGuard: CanActivateFn = () => {
  const session = inject(RiderSessionService);
  console.log('riderGuard: jobCode =', session.jobCode(), 'isRider =', session.isRider());
  return session.isRider() ? true : inject(Router).createUrlTree(['/rider']);
};

// หน้าร้าน: ไรเดอร์ที่กรอกรหัสแล้วเข้าไม่ได้ ถูกส่งกลับ /rider
export const shopGuard: CanActivateChildFn = () =>
  inject(RiderSessionService).isRider() ? inject(Router).createUrlTree(['/rider']) : true;

