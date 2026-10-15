import { Component, inject, input, output, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { getCustomersResponse } from '../../../../models/get-customers-res';
import { environment } from '../../../environments/environment';

const PRICE_PER_BOX = 65;
const MIN_QTY = 1;
const MAX_QTY = 3;

@Component({
  selector: 'app-order-modal',
  standalone: true,
  imports: [],
  templateUrl: './order-modal.component.html',
  styleUrl: './order-modal.component.css',
})
export class OrderModalComponent {
  private http = inject(HttpClient);

  customers = input.required<getCustomersResponse[]>();
  closed = output<void>();
  saved = output<void>();

  readonly pricePerBox = PRICE_PER_BOX;
  readonly minQty = MIN_QTY;
  readonly maxQty = MAX_QTY;

  customerId = signal<number | null>(null);
  qty = signal(1);
  isSaving = signal(false);
  errorMsg = signal('');

  totalPrice = computed(() => this.qty() * PRICE_PER_BOX);

  isQtyValid = computed(
    () => Number.isInteger(this.qty()) && this.qty() >= MIN_QTY && this.qty() <= MAX_QTY
  );

  canSubmit = computed(
    () => this.customerId() !== null && this.isQtyValid() && !this.isSaving()
  );

  onCustomerChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.customerId.set(value === '' ? null : Number(value));
  }

  onQtyInput(event: Event) {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.qty.set(Number.isNaN(value) ? 0 : value);
  }

  onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close() {
    if (!this.isSaving()) {
      this.closed.emit();
    }
  }

  async submit() {
    if (!this.canSubmit()) return;

    this.isSaving.set(true);
    this.errorMsg.set('');

    try {
      await lastValueFrom(
        this.http.post(`${environment.apiUrl}/orders/add`, {
          customer_id: this.customerId(),
          qty: this.qty(),
        })
      );
      this.saved.emit();
    } catch (error: unknown) {
      console.error('Error adding order:', error);
      if (error instanceof HttpErrorResponse) {
        this.errorMsg.set(error.error?.error ?? `เพิ่มออเดอร์ไม่สำเร็จ (HTTP ${error.status})`);
      } else {
        this.errorMsg.set('เพิ่มออเดอร์ไม่สำเร็จ');
      }
    } finally {
      this.isSaving.set(false);
    }
  }
}