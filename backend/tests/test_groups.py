import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app
from app.core.database import Base
from app.api.deps import get_db


class GroupTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        def override():
            yield self.session
        app.dependency_overrides[get_db] = override
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.session.close()
        self.engine.dispose()

    def test_empty_group_persists_and_validates(self):
        self.assertEqual(self.client.post('/api/groups', json={'name': ' Windows '}).status_code, 201)
        self.assertEqual(self.client.get('/api/groups').json(), ['Windows'])
        self.assertEqual(self.client.post('/api/groups', json={'name': 'Windows'}).status_code, 409)
        self.assertEqual(self.client.post('/api/groups', json={'name': '   '}).status_code, 422)

    def test_group_lifecycle_preserves_service(self):
        service = self.client.post('/api/services', json={'name': 'Print', 'target': 'localhost/Spooler', 'check_type': 'windows_service'}).json()
        url = f"/api/services/{service['id']}"
        self.client.post('/api/groups', json={'name': 'Windows'})
        self.assertEqual(self.client.patch(url, json={'group_name': 'Windows'}).status_code, 200)
        self.assertEqual(self.client.patch('/api/groups?name=Windows', json={'name': 'Local'}).status_code, 200)
        self.assertEqual(self.client.get(url).json()['group_name'], 'Local')
        self.assertEqual(self.client.delete('/api/groups?name=Local').status_code, 204)
        self.assertIsNone(self.client.get(url).json()['group_name'])
        self.assertEqual(self.client.get('/api/groups').json(), [])


if __name__ == '__main__':
    unittest.main()