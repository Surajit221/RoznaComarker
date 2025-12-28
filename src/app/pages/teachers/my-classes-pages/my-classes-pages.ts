import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MyClassesCard } from '../../../components/teacher/my-classes-card/my-classes-card';
import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import { MyClassesForm } from './my-classes-form/my-classes-form';
import { DeviceService } from '../../../services/device.service';
import { BottomsheetDialog } from '../../../shared/bottomsheet-dialog/bottomsheet-dialog';

@Component({
  selector: 'app-my-classes-pages',
  imports: [CommonModule, MyClassesCard, ModalDialog, MyClassesForm, BottomsheetDialog],
  templateUrl: './my-classes-pages.html',
  styleUrl: './my-classes-pages.css',
})
export class MyClassesPages {
  showDialog = false;
  device = inject(DeviceService);
  openSheet = false;

  classes = [
    {
      image: 'https://images.unsplash.com/photo-1584697964154-3f82a5da3d3f?w=600',
      title: 'Creative Essay Practice',
      students: 35,
      assignments: 22,
      submissions: 24,
      description: 'Improve your essay writing with structured creative practice sessions.',
    },
    {
      image: 'https://images.unsplash.com/photo-1581092334703-fc7c0f6db5c6?w=600',
      title: 'Mathematics for Beginners',
      students: 40,
      assignments: 18,
      submissions: 20,
      description: 'Basic arithmetic, algebra, and geometry concepts explained clearly.',
    },
    {
      image: 'https://images.unsplash.com/photo-1513258496099-48168024aec0?w=600',
      title: 'Modern Web Development',
      students: 50,
      assignments: 30,
      submissions: 42,
      description: 'Learn HTML, CSS, and JavaScript fundamentals with projects.',
    },
    {
      image: 'https://images.unsplash.com/photo-1603570419983-c981ef2d7e8f?w=600',
      title: 'Digital Illustration',
      students: 25,
      assignments: 15,
      submissions: 18,
      description: 'Master drawing and coloring techniques using digital tools.',
    },
    {
      image: 'https://images.unsplash.com/photo-1596495577886-d920f1fb7238?w=600',
      title: 'Physics for Thinkers',
      students: 28,
      assignments: 20,
      submissions: 17,
      description: 'Explore physical concepts through logic and thought experiments.',
    },
    {
      image: 'https://images.unsplash.com/photo-1573496529574-be85d6a60704?w=600',
      title: 'Public Speaking Mastery',
      students: 32,
      assignments: 10,
      submissions: 12,
      description: 'Develop confidence and communication skills for presentations.',
    },
    {
      image: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=600',
      title: 'Creative Writing Basics',
      students: 27,
      assignments: 14,
      submissions: 15,
      description: 'Build your storytelling skills through guided exercises.',
    },
    {
      image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600',
      title: 'UI/UX Design Introduction',
      students: 42,
      assignments: 25,
      submissions: 29,
      description: 'Learn the basics of modern UI/UX design with hands-on projects.',
    },
    {
      image: 'https://images.unsplash.com/photo-1531497865144-0464ef8fb9f7?w=600',
      title: 'Photography 101',
      students: 36,
      assignments: 12,
      submissions: 10,
      description: 'Understand composition, lighting, and camera techniques.',
    },
    {
      image: 'https://images.unsplash.com/photo-1494173853739-c21f58b16055?w=600',
      title: 'Startup Fundamentals',
      students: 18,
      assignments: 9,
      submissions: 8,
      description: 'Learn how to start and grow your own business from scratch.',
    },
  ];

  onAddClasses() {
    this.showDialog = true;
  }
  closeDialog() {
    this.showDialog = false;
  }

  onOpenCreateClass() {
    document.body.classList.add('overflow-hidden');
    this.openSheet = true;
  }

  onCloseCreateClass() {
    document.body.classList.remove('overflow-hidden');
    this.openSheet = false;
  }
}
