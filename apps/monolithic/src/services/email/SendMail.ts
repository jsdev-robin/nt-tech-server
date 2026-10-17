import ejs from 'ejs';
import nodemailer from 'nodemailer';
import pRetry from 'p-retry';
import path from 'path';

interface IEmailData {
  user: {
    email: string;
  };
}

export class SendEmail {
  private readonly data: IEmailData;

  constructor(data: IEmailData) {
    this.data = data;
  }

  private transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: true,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  send = async (template: string, subject: string) => {
    await pRetry(
      async () => {
        await this.transporter.sendMail({
          from: `Jsdev Robin <${process.env.EMAIL_FROM}>`,
          to: this.data.user.email,
          subject: subject,
          html: await ejs.renderFile(
            process.env.NODE_ENV !== 'production'
              ? path.join(
                  process.cwd(),
                  'apps/monolithic/src/services/email/templates',
                  `${template}.ejs`,
                )
              : path.join(__dirname, 'templates', `${template}.ejs`),
            { data: { ...this.data }, subject },
          ),
        });
      },
      { retries: 3 },
    );
  };

  public async verifyEmail(): Promise<void> {
    await this.send('verifyEmail', 'Email verify');
  }

  public async forgotPassword(): Promise<void> {
    await this.send('forgotPassword', 'Forgot password request');
  }

  public async emailChangeRequest(): Promise<void> {
    await this.send('emailChangeRequest', 'Email Address Change Notification');
  }

  public async emailChangeAlert(): Promise<void> {
    await this.send('emailChangeAlert', 'Email Change Alert');
  }
}
