import { Injectable, signal } from '@angular/core';
import { RiderJob } from '../models/job.model';

const MOCK_JOB: RiderJob = {
  code: 'JOB-240913-R1',
  roundLabel: 'รอบเที่ยง',
  totalBoxes: 6,
  readyText: 'พร้อมออกส่ง',
  deadlineText: 'ส่งครบก่อน 12:30 น.',
  orderRef: 'JOB-240913-R1',
  stops: [
    {
      id: '1', seq: 1, customerName: 'คุณอรทัย พรมมา', boxCount: 2,
      phone: '089-245-7812', address: 'หมู่บ้านเอื้ออาทร ท่าขอนยาง',
      etaText: '11:48 น.', lat: 16.2458, lng: 103.2506, delivered: false
    },
    {
      id: '2', seq: 2, customerName: 'คุณกิตติศักดิ์ แสงทอง', boxCount: 1,
      phone: '081-673-9021', address: 'ถ.ขามเรียง ใกล้ประตู 2 มมส',
      etaText: '12:02 น.', lat: 16.2487, lng: 103.2531, delivered: false
    },
    {
      id: '3', seq: 3, customerName: 'คุณณัฐณิชา วงศ์คำ', boxCount: 3,
      phone: '095-148-3356', address: 'หอพักสุขใจ ต.ขามเรียง',
      etaText: '12:17 น.', lat: 16.2421, lng: 103.2558, delivered: false
    }
  ]
};

@Injectable({ providedIn: 'root' })
export class JobService {
  private readonly _job = signal<RiderJob>(MOCK_JOB);
  readonly job = this._job.asReadonly();

  getJobByCode(code: string): RiderJob | undefined {
    const current = this._job();
    return current.code === code ? current : undefined;
  }

  markDelivered(jobCode: string, stopId: string) {
    this._job.update(job =>
      job.code !== jobCode
        ? job
        : { ...job, stops: job.stops.map(s => (s.id === stopId ? { ...s, delivered: true } : s)) }
    );
  }
}
