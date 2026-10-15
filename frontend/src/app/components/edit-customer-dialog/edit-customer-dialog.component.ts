import { Component, EventEmitter, Input, Output, inject, signal, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { getCustomersResponse } from '../../../../models/get-customers-res';
import { environment } from '../../../environments/environment';

const MSU_LAT = 16.2467;
const MSU_LNG = 103.2519;
const MAX_RADIUS_KM = 3;

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Component({
  selector: 'app-edit-customer-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './edit-customer-dialog.component.html',
  styleUrl: './edit-customer-dialog.component.css',
})
export class EditCustomerDialogComponent implements OnInit {
  private http = inject(HttpClient);

  @Input({ required: true }) customer!: getCustomersResponse;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<getCustomersResponse>();

  name = signal('');
  phone = signal('');
  latitude = signal<string | number>('');
  longitude = signal<string | number>('');
  saving = signal(false);
  errorMsg = signal('');

  ngOnInit() {
    if (this.customer) {
      this.name.set(this.customer.name || '');
      this.phone.set(this.customer.phone || '');
      this.latitude.set(this.customer.latitude ?? '');
      this.longitude.set(this.customer.longitude ?? '');
    }
  }

  async onSave() {
    const name = this.name().toString().trim();
    const phone = this.phone().toString().trim();
    const lat = Number(this.latitude());
    const lng = Number(this.longitude());

    if (!name || !phone || this.latitude() === '' || this.longitude() === '') {
      this.errorMsg.set('กรุณากรอกข้อมูลที่จำเป็นให้ครบ');
      return;
    }
    if (phone.replace(/-/g, '').length !== 10) {
      this.errorMsg.set('เบอร์โทรต้องเป็นตัวเลข 10 หลัก');
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      this.errorMsg.set('พิกัดไม่ถูกต้อง');
      return;
    }

    const distance = calculateDistanceKm(MSU_LAT, MSU_LNG, lat, lng);
    if (distance > MAX_RADIUS_KM) {
      this.errorMsg.set(`อยู่นอกพื้นที่ให้บริการ (ระยะทาง ${distance.toFixed(2)} กม. เกินรัศมี ${MAX_RADIUS_KM} กม.)`);
      return;
    }

    this.saving.set(true);
    this.errorMsg.set('');

    try {
      // backend ตอบกลับเป็น array ของแถวที่แก้ไข
      const res = await lastValueFrom(
        this.http.put<getCustomersResponse[]>(`${environment.apiUrl}/customers/update/${this.customer.customer_id}`, {
          name,
          phone,
          latitude: lat,
          longitude: lng,
        })
      );
      this.saved.emit(res[0] ?? { ...this.customer, name, phone, latitude: lat, longitude: lng });
    } catch (e) {
      console.error('Error updating customer:', e);
      if (e instanceof HttpErrorResponse) {
        if (e.status === 0) {
          this.errorMsg.set('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (เซิร์ฟเวอร์ไม่ทำงาน หรือ CORS ไม่อนุญาต PUT)');
        } else {
          this.errorMsg.set(
            e.error?.error ?? e.error?.message ?? `แก้ไขข้อมูลลูกค้าไม่สำเร็จ (HTTP ${e.status})`
          );
        }
      } else {
        this.errorMsg.set('เกิดข้อผิดพลาดในการแก้ไขข้อมูลลูกค้า');
      }
    } finally {
      this.saving.set(false);
    }
  }
}