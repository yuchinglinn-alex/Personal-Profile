# Personal Profile

Alex's personal profile website, a single page built with plain HTML and CSS and served by GitHub Pages.

## Files

- `index.html`: all page content (About, Experience, Projects, Skills, Contact).
- `styles.css`: layout and colors. The color tokens at the top of the file control the whole theme, including dark mode.
- `.nojekyll`: tells GitHub Pages to serve the files as they are, without a Jekyll build.

## Editing content

Open `index.html` and replace the placeholder text. To add a job, copy one `<li class="role">` block inside the Experience section. To add a project, copy one `<article class="card">` block.

## Previewing locally

Open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.

## Publishing

In the repository's Settings → Pages, set the source to "Deploy from a branch", pick `main` and `/ (root)`. The site will be at https://yuchinglinn-alex.github.io/Personal-Profile/.
