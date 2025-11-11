from sqlalchemy import create_engine, text
import os, sys
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///local.db')
def main():
    print('DATABASE_URL=', DATABASE_URL)
    engine = create_engine(DATABASE_URL)
    try:
        with engine.connect() as conn:
            print('Connected:', conn.execute(text('SELECT 1')).scalar())
    except Exception as e:
        print('Error:', e)
        sys.exit(2)
if __name__=='__main__': main()
