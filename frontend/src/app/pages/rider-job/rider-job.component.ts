import { Component, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { getRiderJobResponse, getRiderJobStop } from '../../../../models/get-rider-jop-res';
import { environment } from '../../../environments/environment';

// ค่าเดียวกับที่ใช้คำนวณเส้นทางในหน้าจัดสายส่ง
const SPEED_KMH = 30;
const TIME_PER_STOP_MIN = 3;
const PICKUP_MINUTES = 11 * 60 + 30; // รับอาหาร 11:30 น.

type View = 'lookup' | 'detail' | 'navigate';

export interface StopWithEta extends getRiderJobStop {
  eta: string;
}

@Component({
  selector: 'app-rider-job',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './rider-job.component.html',
  styleUrl: './rider-job.component.css',
})
export class RiderJobComponent {
  private http = inject(HttpClient);

  view = signal<View>('lookup');
  jobCodeInput = signal('');
  job = signal<getRiderJobResponse | null>(null);
  isLoading = signal(false);
  errorMsg = signal('');

  currentIndex = signal(0);
  finished = signal(false);

  // คำนวณเวลาคาดว่าจะถึงของแต่ละจุด
  stops = computed<StopWithEta[]>(() => {
    const job = this.job();
    if (!job) return [];

    let clock = PICKUP_MINUTES;
    return [...job.stops]
      .sort((a, b) => a.stop_seq - b.stop_seq)
      .map((stop) => {
        const arrival = clock + (stop.distance_km / SPEED_KMH) * 60;
        clock = arrival + TIME_PER_STOP_MIN;
        return { ...stop, eta: this.formatTime(arrival) };
      });
  });

  currentStop = computed(() => this.stops()[this.currentIndex()] ?? null);

  onCodeInput(event: Event) {
    this.jobCodeInput.set((event.target as HTMLInputElement).value);
  }

  async findJob() {
    const code = this.jobCodeInput().trim().toUpperCase();
    if (!code || this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMsg.set('');

    try {
      const job = await lastValueFrom(
        this.http.get<getRiderJobResponse>(
          `${environment.apiUrl}/job-sheets/code/${encodeURIComponent(code)}`
        )
      );
      this.job.set(job);
      this.currentIndex.set(0);
      this.finished.set(false);
      this.view.set('detail');
    } catch (error: unknown) {
      console.error('Error fetching job sheet:', error);
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.errorMsg.set('ไม่พบใบงานนี้ กรุณาตรวจสอบเลขใบงานอีกครั้ง');
      } else if (error instanceof HttpErrorResponse && error.status === 400) {
        this.errorMsg.set('รูปแบบเลขใบงานไม่ถูกต้อง');
      } else {
        this.errorMsg.set('เรียกดูใบงานไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  startJob() {
    this.currentIndex.set(0);
    this.finished.set(false);
    this.view.set('navigate');
  }

  onArrived() {
    if (this.currentIndex() < this.stops().length - 1) {
      this.currentIndex.update((i) => i + 1);
    } else {
      this.finished.set(true);
    }
  }

  backToDetail() {
    this.view.set('detail');
  }

  leaveJob() {
    this.job.set(null);
    this.jobCodeInput.set('');
    this.errorMsg.set('');
    this.finished.set(false);
    this.currentIndex.set(0);
    this.view.set('lookup');
  }

  mapsUrl(stop: getRiderJobStop): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}&travelmode=two-wheeler`;
  }

  private formatTime(totalMinutes: number): string {
    const rounded = Math.round(totalMinutes);
    const h = Math.floor(rounded / 60) % 24;
    const m = (rounded % 60).toString().padStart(2, '0');
    return `${h}:${m} น.`;
  }
}