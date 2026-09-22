import { Component, OnInit, inject, signal } from '@angular/core';
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

      const combinedData = ordersData.map((order) => {
        const customer = customersData.find((customer) => customer.customer_id === order.customer_id);
        const totalQty = ordersData.reduce((sum, item) => sum + (item.qty || 1), 0);

        return {
          ...order,
          customer: customer,
          totalQuantity: totalQty,
        };
      });

      this.orders.set(combinedData);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }
}