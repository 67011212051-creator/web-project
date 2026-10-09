import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom, forkJoin } from 'rxjs';
import { getOrdersResponse } from '../../../../models/get-orders-res';
import { getCustomersResponse } from '../../../../models/get_customers_res';
import { environment } from '../../../environments/environment';
export interface OrderWithItems extends getOrdersResponse {
  customer?: getCustomersResponse;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class OrdersComponent implements OnInit {
  private http = inject(HttpClient);

  orders = signal<OrderWithItems[]>([]);
  totalQty = computed(() =>
    this.orders().reduce((sum, order) => sum + order.qty, 0)
  );

  qtyByCustomer = computed(() => {
    const map = new Map<number, number>();
    for (const o of this.orders()) {
      map.set(o.customer_id, (map.get(o.customer_id) ?? 0) + o.qty);
    }
    return map;
  });

  avgQty = computed(() => {
    const count = this.orders().length;
    return count ? this.totalQty() / count : 0;
  });

  ngOnInit() {
    this.callApi();
  }

  async callApi() {
    try {
      const [ordersData, customersData] = await lastValueFrom(
        forkJoin([
          this.http.get<getOrdersResponse[]>(`${environment.apiUrl}/orders`),
          this.http.get<getCustomersResponse[]>(`${environment.apiUrl}/customers`),
        ])
      );

      const combinedData: OrderWithItems[] = ordersData.map((order) => {
        const customer = customersData.find(
          (c) => c.customer_id === order.customer_id
        );

        return {
          ...order,
          customer: customer,
        };
      });

      this.orders.set(combinedData);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }

  deleteOrder(id: number) {
    if (!window.confirm(`ลบออเดอร์ ${id} หรือไม่?`)) {
      return;
    }

    lastValueFrom(
      this.http.delete<{ order_id: number }>(`${environment.apiUrl}/orders/delete/${id}`)
    )
      .then(() => {
        this.orders.update((orders) => orders.filter((order) => order.order_id !== id));
      })
      .catch((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          console.error('Error deleting order:', {
            status: error.status,
            message: error.message,
            response: error.error,
          });
          const message = error.error?.error ?? `ลบออเดอร์ไม่สำเร็จ (HTTP ${error.status})`;
          window.alert(message);
          return;
        }

        console.error('Error deleting order:', error);
        window.alert('ลบออเดอร์ไม่สำเร็จ');
      });
  }
}