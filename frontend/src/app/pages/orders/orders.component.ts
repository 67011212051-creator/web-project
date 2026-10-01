import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom, forkJoin } from 'rxjs';
import { getOrdersResponse } from '../../../../models/get-orders-res';
import { getCustomersResponse } from '../../../../models/get_customers_res';

export interface OrderWithItems extends getOrdersResponse {
  totalQuantity?: number;
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

  ngOnInit() {
    this.callApi();
  }

  async callApi() {
    try {
      const [ordersData, customersData] = await lastValueFrom(
        forkJoin([
          this.http.get<getOrdersResponse[]>('http://localhost:3000/orders'),
          this.http.get<getCustomersResponse[]>('http://localhost:3000/customers'),
        ])
      );

      const combinedData: OrderWithItems[] = ordersData.map((order) => {
        const customer = customersData.find(
          (c) => c.customer_id === order.customer_id
        );

        return {
          ...order,
          customer: customer,
          totalQuantity: order.qty,
        };
      });

      this.orders.set(combinedData);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }
}