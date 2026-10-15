import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { getOrdersResponse } from '../../../../models/get-orders-res';
import { getCustomersResponse } from '../../../../models/get-customers-res';

const MAX_QTY = 3;

@Component({
  selector: 'app-edit-order-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './edit-order-dialog.component.html',
  styleUrl: './edit-order-dialog.component.css',
})

export class EditOrderDialogComponent {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  order = input.required<getOrdersResponse>();
  customers = input.required<getCustomersResponse[]>();

  closed = output<void>();
  saved = output<void>();

  saving = signal(false);

  readonly maxQty = MAX_QTY;

  form = this.fb.nonNullable.group({
    order_id: [{ value: 0, disabled: true }],
    customer_id: [0, [Validators.required, Validators.min(1)]],
    qty: [1, [Validators.required, Validators.min(1), Validators.max(MAX_QTY)]],
  });

  constructor() {
    effect(() => {
      const o = this.order();
      this.form.patchValue({
        order_id: o.order_id,
        customer_id: o.customer_id,
        qty: o.qty,
      });
    });
  }

  decreaseQty() {
    const qty = this.form.controls.qty;
    if (qty.value > 1) qty.setValue(qty.value - 1);
  }

  increaseQty() {
    const qty = this.form.controls.qty;
    if (qty.value < MAX_QTY) qty.setValue(qty.value + 1);
  }

  onCancel() {
    if (!this.saving()) this.closed.emit();
  }

  async onSubmit() {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const { customer_id, qty } = this.form.getRawValue();

    try {
      await lastValueFrom(
        this.http.put(`${environment.apiUrl}/orders/update/${this.order().order_id}`, {
          customer_id: Number(customer_id),
          qty: Number(qty),
        })
      );
      this.saved.emit();
    } catch (error: unknown) {
      console.error('Error updating order:', error);
      window.alert(
        error instanceof HttpErrorResponse
          ? error.error?.error ?? `แก้ไขออเดอร์ไม่สำเร็จ (HTTP ${error.status})`
          : 'แก้ไขออเดอร์ไม่สำเร็จ'
      );
    } finally {
      this.saving.set(false);
    }
  }
}