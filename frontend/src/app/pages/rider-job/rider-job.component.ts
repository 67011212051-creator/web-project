import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RiderSessionService } from '../../rider-session.service';
import { JobSheet } from '../../../../models/rider-job.model';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './rider-job.component.html',
  styleUrl: './rider-job.component.css',
})
export class DetailComponent implements OnInit {
  private http = inject(HttpClient);
  private session = inject(RiderSessionService);

  codeInput = signal('');
  job = signal<JobSheet | null>(null);
  error = signal('');
  loading = signal(false);

  // ถ้าเคยกรอกรหัสไว้แล้ว (ในแท็บนี้) โหลดใบงานให้เลย
  ngOnInit() {
    const saved = this.session.jobCode();
    if (saved) {
      this.codeInput.set(saved);
      void this.load(saved);
    }
  }

  onInput(event: Event) {
    this.codeInput.set((event.target as HTMLInputElement).value);
  }

  async submit() {
    const code = this.codeInput().trim().toUpperCase();
    if (!code) {
      this.error.set('กรุณากรอกรหัสใบงาน');
      return;
    }
    await this.load(code);
  }

  private async load(code: string) {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');

    try {
      const job = await lastValueFrom(
        this.http.get<JobSheet>(`${environment.apiUrl}/job-sheets/code/${encodeURIComponent(code)}`)
      );
      this.session.login(code); // จำรหัสไว้ให้หน้านำทางใช้ต่อ
      this.job.set(job);
    } catch (e) {
      this.session.logout();
      this.job.set(null);
      this.error.set(
        e instanceof HttpErrorResponse && e.status === 404
          ? 'ไม่พบใบงานนี้ กรุณาตรวจสอบรหัสอีกครั้ง'
          : 'โหลดใบงานไม่สำเร็จ ลองใหม่อีกครั้ง'
      );
    } finally {
      this.loading.set(false);
    }
  }

  logout() {
    this.session.logout();
    this.job.set(null);
    this.codeInput.set('');
    this.error.set('');
  }
}