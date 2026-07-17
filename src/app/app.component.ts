import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
<<<<<<< HEAD
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
=======
    selector: 'app-root',
    imports: [RouterOutlet],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
>>>>>>> 022816f6 (modification de la responsivité)
})
export class AppComponent {
  title = 'srb-frontend';
}
