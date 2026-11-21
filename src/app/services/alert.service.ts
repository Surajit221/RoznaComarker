import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

/**
 * A SweetAlert dialog (not a toast) is on screen. Dialogs underneath leave Esc and Tab to it, so Esc closes only the SweetAlert.
 * A toast never counts: it has no focus or Esc of its own.
 */
export function sweetAlertDialogOpen(doc: Document = document): boolean {
    return !!doc.querySelector('.swal2-container .swal2-popup:not(.swal2-toast)');
}

@Injectable({ providedIn: 'root' })
export class AlertService {
    private readonly swalOptions: SweetAlertOptions = {
        customClass: {
            popup: 'swal-popup-custom',
            title: 'swal-title-custom',
            htmlContainer: 'swal-html-custom',
            confirmButton: 'swal-confirm-button-custom',
            cancelButton: 'swal-cancel-button-custom',
        },
        buttonsStyling: false,
        reverseButtons: true, // <-- opsional tapi UX lebih baik
    };

    showSuccess(title: string, text: string) {
        this.showAlert(title, text, 'success');
    }

    showError(title: string, text: string) {
        Swal.fire({
            ...this.swalOptions,
            title,
            text,
            icon: 'error',
            confirmButtonText: 'OK',
            customClass: {
                ...this.swalOptions.customClass,
                popup: 'swal-popup-custom swal-error-popup',
            },
        });
    }

    showWarning(title: string, text: string) {
        this.showAlert(title, text, 'warning');
    }

    showInfo(title: string, text: string) {
        this.showAlert(title, text, 'info');
    }

    private showAlert(title: string, text: string, icon: SweetAlertIcon) {
        Swal.fire({
            ...this.swalOptions,
            title,
            text,
            icon,
            confirmButtonText: 'OK',
        });
    }

    async showConfirm(
        title: string,
        text: string,
        confirmButtonText = 'Ya',
        cancelButtonText = 'Batal',
        /** returnFocus: false when the caller moves focus itself (e.g. back to the button that opened a dialog it closes). */
        options: Pick<SweetAlertOptions, 'returnFocus'> = {}
    ): Promise<boolean> {
        const result = await Swal.fire({
            ...this.swalOptions,
            title,
            text,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText,
            cancelButtonText,
            ...options,
        });
        return result.isConfirmed;
    }

    showToast(title: string, icon: SweetAlertIcon = 'success') {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 7000,
            timerProgressBar: true,
            didOpen: toast => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            },
        });

        Toast.fire({ icon, title });
    }
}
