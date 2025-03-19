# TextBIMG

TextBIMG is a web application that allows you to place text between an image's subject and its background. The application removes the background from an uploaded image, places your custom text behind the subject, and lets you customize the text appearance.

## Features

- Upload images via drag-and-drop or file selection
- Automatic background removal from images
- Place custom text between the subject and background
- Customize text font, size, and color
- Download the resulting image

## Getting Started

### Prerequisites

- Node.js 18.0.0 or later
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/textbimg.git
cd textbimg
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## How to Use

1. Upload an image by dragging and dropping it onto the upload area or by clicking the area to select a file.
2. Wait for the background removal process to complete.
3. Enter your desired text in the text input field.
4. Customize the text appearance using the font, size, and color controls.
5. Download the resulting image by clicking the "Download Result" button.

## Deployment

The application can be deployed to any hosting service that supports Next.js applications, such as Vercel, Netlify, or a traditional server.

### Deploy to Netlify

You can deploy this application to Netlify in several ways:

#### Option 1: Connect to your Git repository (Recommended)

1. Push your repository to GitHub, GitLab, or Bitbucket
2. Log in to [Netlify](https://app.netlify.com/) and click "Add new site" > "Import an existing project"
3. Connect to your Git provider and select your repository
4. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
5. Click "Deploy site"

#### Option 2: Manual deployment using Netlify CLI

1. Install Netlify CLI globally (if not already installed):
```bash
npm install -g netlify-cli
```

2. Build your application:
```bash
npm run build
```

3. Deploy to Netlify:
```bash
npx netlify-cli deploy --prod
```

4. Follow the prompts to complete the deployment

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework
- [React Dropzone](https://react-dropzone.js.org/) - File upload component
- [Background Removal](https://github.com/imgly/background-removal-js) - Background removal library
- [html-to-image](https://github.com/bubkoo/html-to-image) - DOM to image conversion
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework

## License

This project is licensed under the MIT License - see the LICENSE file for details.
