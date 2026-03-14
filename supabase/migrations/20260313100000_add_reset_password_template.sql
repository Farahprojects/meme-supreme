-- Password reset OTC email template (same styling as auth_otc, clearly marked as password change)
INSERT INTO public.email_notification_templates (template_type, subject, body_html, body_text)
VALUES (
    'auth_otc_reset',
    'Reset your Meme Supreme password',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meme Supreme Password Reset</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f5; color: #18191c; }
        .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .header { padding: 48px 0 24px 0; text-align: center; }
        .logo { width: 48px; height: 48px; background-color: #000000; border-radius: 12px; padding: 8px; vertical-align: middle; box-sizing: border-box; }
        .content { padding: 0px 40px 48px 40px; text-align: center; }
        h1 { margin-top: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: #000000; }
        p { font-size: 16px; color: #52525b; margin-bottom: 32px; }
        .code-box { background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; margin-bottom: 32px; display: inline-block; min-width: 200px; }
        .code { font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #000000; margin: 0; margin-right: -12px; }
        .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; margin-bottom: 16px; }
        .footer { padding: 32px 40px; background: #fafafa; text-align: center; border-top: 1px solid #f4f4f5; }
        .footer-text { font-size: 13px; color: #a1a1aa; margin: 0 0 8px 0; }
        .link { color: #a1a1aa; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAQH0lEQVR4Ae1aeXRU1RnPTDaWsNciImhFAUlFW2XT1q1QhBZrW3ChVjy1SqFiS7W1rfWo9XTx0EJPhCrHDSigJwiaw1KgYmQNISUhITvJZJns22SyL5NJf7/75nvcPGbCJLUnfzSXw9z73rfce7/7bfd7CQkZbIMSGJTAoAQGSALbtm0bvnnz5vABmn7gpy0oKnolJydn8cCvZABWgJMf1tLSUlJXV/f+AEw/8FNeuHDh/m609vZ219GjRycN/Ir+ixXExsZG7N27d2JfWNS5XB9RAGwlJSW/6Avt7t0HJ/QF/3+Ou2/fvjElpaV7Dx48ODaYyY4fP34dTr7R2H53t9vtTnn55ZcjgqHNzs6+t6io6I1gcPuMs2zZstA+E4EAG5/Q2traUVlZuT4Yepz4C7J59h6Px5uenn7P5WhjYmIiGxsbk93uhhOXw+0FbgsIy8rNXVNYWPi9gAgBAOfOnYvu7OzEPjzt8OpfC4CmXr/33ntDmpqaMrhxL398raaubltvdIQVl5Y+R3QIIQuHFZTG6Dxz8vIeSklLCxx18goKHu/0dHaVl1e+dPfdd4fpxL2Nc3Lyv+H1GtvhCTG+B8KH81sIXIWsC6Ctrc0VHx9/dSC6E0lJ0+gwKYDmlpaanTt3jg+Ea32/aNGiyLKyij9ijq6srKzbrXDz+cSJE9HtHR2dnMTlcn187NixoJyNw+F4jDTSSktLXzGZWga1tbU7iadvXuiKi4sDOUN7TU3NXsHr6OzoPHv27EwLa7+PCQIJ1yLUHiItwm7l27Gxgf3U+vXrhzY0NubJRE0tLdkZGRm9qjRnhU3/hjSyqY6OjhbY9Czrik6dOjURp1gn/K19fX19qj9nmJfneEw0TGiCSaByc3MXNDU1FwoNnC19R2AfwAVD0r7wZGyH3hobXGXdjP5cWVW1kZPoi3Q3NCRQoDpeUUnJz2Ux/nqPp8t7PjNzgU4DrbwKJ1fqw/cZWnc3tGW1jmcZ26CFv8JBtJHO6zsaOOnLRw8sUp2mort4qN3V1dVvbd++faRlIvXoqq/fbUykEeBFWVnZC4L/1FNPhTc2Nv3bwDOEC55HmpublcaJ8GAiZmYInxAGnE1C48NRxOXl5X8V3np/6NChL+IQY0nDJnw5dhQW/ljH9TvOzMxdoBFxMmO1GDTgVFNTU79sIbQhLJ3mBKQzkfEMlT4ouGlpaXciSnQRj424mZmZ8yGkP6hn9VZlhu4jR05eQ7rtBw6MhIDKBN8gM2aAj/pIeEuPOeYhwqT7WBnr8ekM50a0mi240ttlIH1+vjMTjtAtz76ePENGjBgx94apUz9FtHhY4LfeemsYNuM3f4Dz2S14EyZMeDQ0NNROPmzIG/KRQR5zOp2xWFwHDZOQiIiIkVOnXqv4P7p4cQPs9gDxbTabQSgWbLON5ntpMImfTJs27dDw4cOjOYeaR3CBBHOoxuHlC37AnskQJj0LBmy6BmCfhvSxYC/s6c9r1qyJJCN45BtBk2SQGL/wHfWHDhk5PtLkL2DD5cKQfTnofYuwIy3+TMF8/BuRJzBfIDw5OfkuXXOIB41LPH/+/I2E0ywrqqre4ns26qBoIdcra4ZPOgl0TSSkDtAqKireNdgZAujqMjVXY2+oOMMM2ezZs2ccbC/OR9eN098v7JG6/lDes0fS1JGUdO4rAnc4HE/ocM4HD/5twhkVYHrnBV5VVbVrx459YwhjKARMmR/hsnGOu7h5/vMJFb5kM2mCagUFRSvJRFpNbW0CnNMn8qxPBA9dmJ2ddx8ZwxzCIby/EQ+bflImgy9QcVgW4zLCkWl+MIUrYOsVpPOtl3lInNA7naUvUyj0F3inThEZ63JoVTVp2PQ1VVZW/RMJmVN/XwATEX6X7c+cOTMLp2QeO/KBLJzEaEg/RtMG7MeYFvbVDq/8IhirTeXm5q1MTEz8EidKgHkA3qpW6fuhvVoXAZP4u75g0kD9ZxAPCdmM9PSsFRyvXbt2aEVF5XqsT3HjCmTzMJVuZLGvffDBR1NA7/ZNp+4aaWlZ80gfVEOxYhQSiBJhgOSwMyk1SXl/h6PoSdh3g8Bkcj7DD8SdPn26RzoLwbwiuOxb2trqDscdvsq6EKjzXN4ndFxrqEtCOoyQe1RwDCU3npDmNkIrfkS++fn53xIc9tDSKvoh65y9PkPl/6UzKXRejKFpyWnzGhoaMwWuCwGTOfLyDJPg7Q1hKYt4glNdW/uBv4l594DaJ+q4yPnLduzYoezd4XAsBW/lSHUcjjGHg2FW+JaUlL9o4Bizwk+cAiw4ByhMSkvL/qQzYSIkMPZIUq6sqan7mDjSxCRwku3wBb9OS8v4jmYyyiHhPn+/zkcfOxyFTwsv6ZGFri2FFkkk4JZ48tJqXa4jWMu1Op/aWtcewmU9iFhv6vCgxsi1vyuTsOctz88NMaykpOz3orqc8OLSurtbW9uUHco7OLqCd955Z0SgBRw+fPgqOLZafV5csg1jx0t985wLG9sE3zRM58fQDI3I1nkUFjqf0HGCGh85cmQKbL1ZGGHchNqdcmxWBllZud8XLy74ei8CwIIvWzCBo92i08rY2Lzx1N7e0Qx7/6l1HXw+efLklLb29hahw+F0IWe4zR9ur+9YcIDtqMKFMINtPxCIiJ4a4S5BcOW0ZPNQYU+KnxuilR9s+S6YjYpAVh7k3dDQVJiamnGvlU6emT/IGtjrfkRwgu5h9zt8zNQ+mP31RhzDrKyi6m1ZgGxemYbX2wV7/ZC+IxCPuLhPxiOZ+hD4KsAqAfhCLXm6XPXxgbRQeBaXlPyOuAYHlawdFVif+yKn8xnFjD9oCEGfBcME6rm6re1i0VMEQR6wz0xUheZa+aRmZs6Fn+mhccRnIz0qOm+uW7cuYKVJ+CGS7FJEvh8cyOsC63OfkpJyBzTXXD/CUCVKUZfEU8ZnZHOj9AlIiw2pEMi1mEwwZpKCrM7MFCFo5hZm4qLj0w/lQ6A6702bNkXtPnCgR75BOM0WAu4hxAKU+XTaPo25WW6aC2KDaXpRIfq6lQludD9DEpSI29Y0HcZqsR4qqZa6IKprat6A09so6kqYDsdmYO+pPewdwr4Ol6fjKOAu1+fiGI77GiZEarH4YXSCZn3VitenZz3zImNs9pdWBvn5hcsJQwgrszpK3g8QKl+lNyYOm75J443xTn8Ph3qU3w/0uWA632xpbS0ijdw/dDhLYCJM4jQ1N5du2LChx7VZxw9qXIHQRWbCGI7MvOMLA9bniMOGjXYihX0pJKRnVTn7woWl8MjqwkM8SWO1Uzf3T0dKNRf+7AuLi59D+FMlLt709MxP8HDHeNbgzV/lND8VWL/73Pz8Rwx2xi/ivcPqjFhq1jM+YqLOf0lVmVVnmMol11fZOey9jeakL5ZfnRCN/qGvAT6k2191BxFE5RBiaHCcG3Re/RofTUjgbU5JnovA+JKSNE7jJl6YCJfNcMyMzOoz6Cyx0K2Eswk+BFuWlpGxSF8kboM3u92NUpyBFho00ASPn7K4Hbiq5mhgdXcjGv1A59evMVJNfsnJEabsoWqP68x83/pU1sg1yn/iMoMEfg8vTlp+5RHB1te7E1FYURUe4Qtf8rD1vi9mCJ6tmHOq4LKP2xk3Hv6hhnOy0RQpQB2n32OcmKqyymlVWqor+/fvv1LP4UUAgs8FQY3ftlaVHQ7HEkYBlL9MR8VQxosYFEqRCy/yEH709PT4+oaQ7t6uh2xolJPXeh2n3+Pi4hLlXLgINthxMhZqFkK5AYRLVT+QRRqYPX9xhfZXVTbXhSzxapbSelJd+oSTrqXQTUIMWIHSMRG9gnKAdp1JoHF9fUMS1U/gQ4YMuWH16tXmHzUgPW0DvJlwXrq5ENhjquAL4YgRUXOnoqqMk39QYNKjRH7nbbNnx48ZM2Yx3wkNWIXUu9157M0GV1Te3NxhPmOANSl1Rz1YvW5taTuvwwONgxJAUVE+S+XVwgSl66jJkyebCcaWLVvascBGgaOEbSsqKngNd/lnaItKKABycVjoFZMmTX6f94ply4y/CSh0Op+ecv31B6KGDbueyyceaaDSXYgKa2vr6mLAUtgDGtLeXl3dQwBYk+9boYEHN3HOJPg8BrwHYJNmPlBZWf0XnS8Sl08VnD9ouJSsIhw5wgMwjyq+U7FfXDmeURzdBx/wLmFsBIkJwdG58wsKHiEP4DwvcPaMLlKSJ1yV8JD0EMaGBLALqfgl3yaJ2++G5GYdmUuM9f2RgnksuITsJlwaBPBbmQxF1ltg/2kCk03KM3uamHh5OLBimoTQQwCvCg578KJ5mT4IBdib4TTNwgnoK7Zu3TpO6HvrgzIBMmhqak1kb1PKGRISHh4RHRcXZ34+x+LrCRdLDbWFmh549uzZ5xISTs1HnXGvwcPAM9Tdp/JQcao5ahBnsfkFM2bMOEZcNm9ISI+sEHO14XWXAuJn9Lhx08PDwsy/Z4Dp5K1YsaJO4L31QQugrMyZimSnVZgNGRIxenp0tBlncWl0C4x9aJjdDG18XrhwYdWqVauW4ivOemxAiVHUR4SKS85+FFbumzVrVg5ppEGYQzk2/YDd1iIw9qOiolTFWt6h8kwHKGchr/32QQtg48b4IthlAbmQMxczauTIO4Sr1+tRGiCbCrX3FADxdu3a1TFh/PhnnbgKQ2PNqEEY1PzN12Nili5ZsqSGz3rDZ0FV95MddXk81ACzhUdGzjAfMPB0dCTrz5/buLq6RuXkYsMIj/HC3Fo84dcggfnrUR2+hzc75vWgfd4fjrzDBcxIxHwOFFVf80LGz+5wiuanMxRRvWdTUy8puAgvax+0BpCwubnpNHs55cjI8Jn8Jsh3Xo9HhUmBQUNMH0C4tU2fPj3+fFraAkSJJddMmvSaFa4/w++pj7DgqZQAlQmlPcSZP3/+aHtYmFkcgUBrcjIy8nT63sam4+gNSWDV1fVJEydO9MLfKMFFRkaOnTnzlkfOpKQke7zeyYLHHosdGR0dHYHLUI94rePMmTMnF8/832sLtdmUDwCSki+kMCoxOXleBCYZOnTojRFh4aawYVqO5cuX1/bKsL/AzZtjRyHEGCkvwxaOhqELaofvb11mDGeowt2/GF+GRvZ3Lp0O5mTkIGSMxqs3ox7nRZFKvZPwDF/S4wOOzsffuE8msHLlg26oWKZi5MvMcAghYaGhIfjbB9M0CMdRRU2ZcpNyXv4m7ss7m90uGqDI7HZ7CKMe57XbTaNTsLbOzpS+8O6TAMgYkeAMe04rU/PZ2vDXIEPHjInsEb+tOEE+h9p9JtDbfIQxvOKPKxgCg2598gHkyg+YY8eOVWEQuoc32rJ8Q3Ywichhw4YF/AxGXsE0/JFjGLRuCJIbXrIwHbgbrtAYg4msANfk+lJcXILhKzh9FgDu3Z9AC+ZA9W2d4IKF2cKFG3qoploeYY0u1wUN1K9hVFSUJz0956GoqEgVCci/1Tcn57g4dxi0s7kdf4tY0a+JBokGJTAogUEJDEpgUAKDEhiUwP+bBP4DCb8birnO3lUAAAAASUVORK5CYII=" alt="Meme Supreme" class="logo" />
        </div>
        <div class="content">
            <div class="badge">Password reset</div>
            <h1>Password Reset Code</h1>
            <p>Enter the following 6-digit code to reset your Meme Supreme password. This code expires in 5 minutes.</p>
            <div class="code-box">
                <div class="code">{{otc}}</div>
            </div>
            <p style="margin-bottom: 0; font-size: 14px; color: #71717a;">If you didn''t request a password reset, you can safely ignore this email. Your password has not been changed.</p>
        </div>
        <div class="footer">
            <p class="footer-text">&copy; 2026 Meme Supreme. All rights reserved.</p>
            <p class="footer-text">
                <a href="https://memesupreme.co/terms" class="link">Terms of Service</a> &bull;
                <a href="https://memesupreme.co/privacy" class="link">Privacy Policy</a>
            </p>
        </div>
    </div>
</body>
</html>',
    'Reset your Meme Supreme password. Your code is: {{otc}}. This code expires in 5 minutes. If you did not request a password reset, you can safely ignore this email. Your password has not been changed.'
)
ON CONFLICT (template_type) DO UPDATE
SET subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    body_text = EXCLUDED.body_text,
    updated_at = NOW();
