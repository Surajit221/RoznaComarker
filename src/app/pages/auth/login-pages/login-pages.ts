import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertService } from '../../../services/alert.service';
import { Router } from '@angular/router';
import { DeviceService } from '../../../services/device.service';

@Component({
  selector: 'app-login-pages',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-pages.html',
  styleUrl: './login-pages.css',
})
export class LoginPages {
  loginForm: FormGroup;
  showPassword = false;
  device = inject(DeviceService);

  constructor(private fb: FormBuilder, private alert: AlertService, private router: Router) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      role: ['', Validators.required],
      remember: [false],
    });
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    const role = this.loginForm.value.role
    if (!role || role == '' || role == undefined) {
      return;
    }

    if (this.loginForm.value.role == 'student') {
      localStorage.setItem('role', 'student')
      this.router.navigate(['/student/my-classes'])
    } else {
      localStorage.setItem('role', 'teacher')
      this.router.navigate(['/teacher/my-classes'])
    }
  }
}
