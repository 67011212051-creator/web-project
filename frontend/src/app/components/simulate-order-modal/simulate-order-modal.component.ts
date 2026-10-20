import { Component, inject, input, output, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { getOrdersResponse } from '../../../../models/get-orders-res';
import { getCustomersResponse } from '../../../../models/get-customers-res';

@Component({
  selector: 'app-simulate-order-modal',
  standalone: true,
  imports: [],
  templateUrl: './simulate-order-modal.component.html',
  styleUrl: './simulate-order-modal.component.css',
})
export class SimulateOrderModalComponent {
  private http = inject(HttpClient);

  customers = input.required<getCustomersResponse[]>();
  existingOrders = input.required<getOrdersResponse[]>();

  closed = output<void>();
  started = output<void>();

  count = signal(25);
  clearOld = signal(true);
  loading = signal(false);
  progress = signal('');

  onCountInput(event: Event) {
    const value = Math.floor(Number((event.target as HTMLInputElement).value));
    this.count.set(Math.min(Math.max(value || 1, 1), Math.max(this.maxCount(), 1)));
  }

  onClearOldChange(event: Event) {
    this.clearOld.set((event.target as HTMLInputElement).checked);
  }

  async start() {
    if (this.loading()) return;

    const pool = this.availableCustomers();
    if (pool.length === 0) {
      window.alert('ไม่มีลูกค้าที่ว่างสำหรับจำลองออเดอร์');
      return;
    }

    const total = this.effectiveCount();
    const oldOrders = this.clearOld() ? this.existingOrders() : [];
    if (oldOrders.length > 0 &&
      !window.confirm(`จะลบออเดอร์เดิม ${oldOrders.length} รายการ แล้วสร้างใหม่ ${total} รายการ ต้องการดำเนินการต่อหรือไม่?`)) {
      return;
    }

    this.loading.set(true);
    try {
      this.progress.set('กำลังจำลองออเดอร์...');
      await lastValueFrom(
        this.http.post(`${environment.apiUrl}/orders/simulate`, {
          count: total,
          clearOld: this.clearOld(),
        })
      );
    } catch (error: unknown) {
      console.error('Error simulating orders:', error);
      window.alert(
        error instanceof HttpErrorResponse
          ? error.error?.error ?? `จำลองออเดอร์ไม่สำเร็จ (HTTP ${error.status})`
          : 'จำลองออเดอร์ไม่สำเร็จ'
      );
    } finally {
      this.loading.set(false);
      this.progress.set('');
      this.started.emit(); // โหลดรายการใหม่ แม้ทำสำเร็จบางส่วน
    }
  }

  // ลูกค้าที่ยังไม่มีออเดอร์ (ถ้าเลือกลบของเก่า ก็ใช้ได้ทุกคน)
  availableCustomers = computed(() => {
    if (this.clearOld()) return this.customers();
    const used = new Set(this.existingOrders().map((o) => o.customer_id));
    return this.customers().filter((c) => !used.has(c.customer_id));
  });

  // จำนวนออเดอร์สูงสุด = จำนวนลูกค้าที่ใช้ได้ (ไม่เกิน 50)
  maxCount = computed(() => Math.min(50, this.availableCustomers().length));

  effectiveCount = computed(() => Math.min(this.count(), this.maxCount()));
}