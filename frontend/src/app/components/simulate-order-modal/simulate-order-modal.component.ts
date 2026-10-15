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

  // ทำทีละกลุ่ม ไม่ยิง request พร้อมกันทีเดียวทั้งหมด
  private async runInBatches<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>) {
    for (let i = 0; i < items.length; i += size) {
      await Promise.all(items.slice(i, i + size).map(fn));
    }
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
      // 1) ลบออเดอร์เก่า
      let done = 0;
      await this.runInBatches(oldOrders, 5, async (o) => {
        await lastValueFrom(
          this.http.delete(`${environment.apiUrl}/orders/delete/${o.order_id}`, { responseType: 'text' })
        );
        this.progress.set(`กำลังลบออเดอร์เก่า ${++done}/${oldOrders.length}`);
      });

      // 2) เพิ่มออเดอร์ใหม่ (สุ่มลูกค้า + กล่อง 1-3)
      const rows = this.shuffle(pool).slice(0, total).map((c) => ({
      customer_id: c.customer_id,
      order_date: new Date().toISOString(),
      delivery_fee: 0,
      qty: Math.floor(Math.random() * 3) + 1,
    }));

      done = 0;
      await this.runInBatches(rows, 5, async (row) => {
        await lastValueFrom(this.http.post(`${environment.apiUrl}/orders/add`, row));
        this.progress.set(`กำลังสร้างออเดอร์ใหม่ ${++done}/${rows.length}`);
      });
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

  private shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}