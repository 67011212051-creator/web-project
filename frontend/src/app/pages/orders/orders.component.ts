import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom, forkJoin } from 'rxjs';
import { getOrdersResponse } from '../../../../models/get-orders-res';
import { getOrderItemsResponse } from '../../../../models/get-order_items_res';
import { getCustomersResponse } from '../../../../models/get_customers_res';

export interface OrderWithItems extends getOrdersResponse {
  items?: getOrderItemsResponse[];
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
      const [ordersData, itemsData, customersData] = await lastValueFrom(
        forkJoin([
          this.http.get<getOrdersResponse[]>('http://localhost:3000/orders'),
          this.http.get<getOrderItemsResponse[]>('http://localhost:3000/order_items'),
          this.http.get<getCustomersResponse[]>('http://localhost:3000/customers'),
        ])
      );

      const combinedData = ordersData.map((order) => {
        const orderItems = itemsData.filter((item) => item.order_id === order.order_id);
        const customer = customersData.find((customer) => customer.customer_id === order.customer_id);
        const totalQty = orderItems.reduce((sum, item) => sum + (item.qty || 1), 0);

        return {
          ...order,
          items: orderItems,
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