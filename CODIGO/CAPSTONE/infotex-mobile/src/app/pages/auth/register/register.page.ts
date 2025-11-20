import { Component } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [IonButton, IonContent, IonHeader, IonPage, IonTitle, IonToolbar],
})
export class RegisterPage {}
